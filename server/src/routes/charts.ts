import { Router } from 'express';
import { nanoid } from 'nanoid';
import {
  readIndex,
  loadChart,
  saveChart,
  deleteChartFile,
  garbageCollectPhotos,
  listChartHistory,
  restoreChartFromHistory,
  isValidChartId,
} from '../lib/dataStore';
import type { Chart, Person } from '../types';
import { isStoredPhotoName } from '../lib/images';
import { ValidationError, requireNonEmptyString, requireString, requireStringArray, requirePosition } from '../lib/validation';

const router = Router();

/** null (photo cleared) or a safe stored photo filename; anything else is rejected. */
function parsePhotoField(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (!isStoredPhotoName(value)) throw new ValidationError('photo must be a valid uploaded photo reference');
  return value;
}

// Reject any chart id that isn't a plain slug/nanoid segment before it reaches the filesystem.
router.param('id', (_req, res, next, id) => {
  if (!isValidChartId(id)) return res.status(400).json({ error: 'Invalid chart id' });
  next();
});

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base || 'chart';
}

/** Returns true if `candidateId` is `personId` itself or a descendant of it (would create a cycle). */
function isSelfOrDescendant(people: Person[], personId: string, candidateId: string): boolean {
  if (personId === candidateId) return true;
  const children = people.filter((p) => p.managerId === personId);
  return children.some((c) => isSelfOrDescendant(people, c.id, candidateId));
}

function parseColorField(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

/** Bound stored free-text notes so a bad client can't bloat chart files. */
const MAX_NOTES_LENGTH = 4000;

function parseNotesField(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_NOTES_LENGTH) : '';
}

// GET /api/charts - index of all charts
router.get('/', (_req, res) => {
  res.json(readIndex());
});

// POST /api/charts - create a new (empty) chart
router.post('/', (req, res) => {
  const { partnerName } = req.body ?? {};
  if (!partnerName || typeof partnerName !== 'string' || !partnerName.trim()) {
    return res.status(400).json({ error: 'partnerName is required' });
  }
  let id = slugify(partnerName);
  const index = readIndex();
  if (index.some((e) => e.id === id)) {
    id = `${id}-${nanoid(5).toLowerCase()}`;
  }
  const chart: Chart = { id, partnerName: partnerName.trim(), description: '', people: [] };
  saveChart(chart);
  res.status(201).json(chart);
});

// GET /api/charts/:id
router.get('/:id', (req, res) => {
  const chart = loadChart(req.params.id);
  if (!chart) return res.status(404).json({ error: 'Chart not found' });
  res.json(chart);
});

// PATCH /api/charts/:id - rename and/or update notes
router.patch('/:id', (req, res) => {
  const chart = loadChart(req.params.id);
  if (!chart) return res.status(404).json({ error: 'Chart not found' });
  const { partnerName, description } = req.body ?? {};
  if (typeof partnerName === 'string' && partnerName.trim()) {
    chart.partnerName = partnerName.trim();
  }
  if (typeof description === 'string') {
    chart.description = description;
  }
  saveChart(chart);
  res.json(chart);
});

// DELETE /api/charts/:id
router.delete('/:id', (req, res) => {
  const found = deleteChartFile(req.params.id);
  if (!found) return res.status(404).json({ error: 'Chart not found' });
  garbageCollectPhotos();
  res.status(204).end();
});

// GET /api/charts/:id/history - list saved point-in-time snapshots, newest first
router.get('/:id/history', (req, res) => {
  if (!loadChart(req.params.id)) return res.status(404).json({ error: 'Chart not found' });
  res.json(listChartHistory(req.params.id));
});

// POST /api/charts/:id/history/restore - roll the chart back to a saved snapshot
router.post('/:id/history/restore', (req, res) => {
  if (!loadChart(req.params.id)) return res.status(404).json({ error: 'Chart not found' });
  const { timestamp } = req.body ?? {};
  if (typeof timestamp !== 'string') {
    return res.status(400).json({ error: 'timestamp is required' });
  }
  const restored = restoreChartFromHistory(req.params.id, timestamp);
  if (!restored) return res.status(404).json({ error: 'That snapshot no longer exists.' });
  res.json(restored);
});

// PATCH /api/charts/:id/positions - batch-update multiple people's saved canvas positions in one write
router.patch('/:id/positions', (req, res) => {
  const chart = loadChart(req.params.id);
  if (!chart) return res.status(404).json({ error: 'Chart not found' });
  const { positions } = req.body ?? {};
  if (!positions || typeof positions !== 'object') {
    return res.status(400).json({ error: 'positions must be an object of personId -> {x, y}' });
  }
  const now = new Date().toISOString();
  for (const person of chart.people) {
    const pos = (positions as Record<string, unknown>)[person.id];
    if (
      pos &&
      typeof pos === 'object' &&
      typeof (pos as { x?: unknown }).x === 'number' &&
      typeof (pos as { y?: unknown }).y === 'number'
    ) {
      person.position = { x: (pos as { x: number }).x, y: (pos as { y: number }).y };
      person.updatedAt = now;
    }
  }
  saveChart(chart);
  res.json(chart);
});

// POST /api/charts/:id/people - add a person
router.post('/:id/people', (req, res) => {
  const chart = loadChart(req.params.id);
  if (!chart) return res.status(404).json({ error: 'Chart not found' });

  const { name, title, department, photo, managerId, sponsorIds, tags, edgeColor, backgroundColor, colorLabel, notes } = req.body ?? {};
  if (managerId && !chart.people.some((p) => p.id === managerId)) {
    return res.status(400).json({ error: 'managerId does not exist in this chart' });
  }

  let person: Person;
  try {
    const now = new Date().toISOString();
    person = {
      id: nanoid(10),
      name: requireNonEmptyString(name, 'name'),
      title: title === undefined ? '' : requireString(title, 'title'),
      department: department === undefined ? '' : requireString(department, 'department'),
      photo: parsePhotoField(photo),
      managerId: managerId ?? null,
      sponsorIds: sponsorIds === undefined ? [] : requireStringArray(sponsorIds, 'sponsorIds'),
      tags: tags === undefined ? [] : requireStringArray(tags, 'tags'),
      edgeColor: parseColorField(edgeColor),
      backgroundColor: parseColorField(backgroundColor),
      colorLabel: typeof colorLabel === 'string' ? colorLabel.trim() : '',
      notes: parseNotesField(notes),
      position: null,
      createdAt: now,
      updatedAt: now,
    };
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    throw err;
  }
  chart.people.push(person);
  saveChart(chart);
  res.status(201).json(person);
});

// PUT /api/charts/:id/people/:personId - update a person (fields, manager, sponsor, position)
router.put('/:id/people/:personId', (req, res) => {
  const chart = loadChart(req.params.id);
  if (!chart) return res.status(404).json({ error: 'Chart not found' });
  const person = chart.people.find((p) => p.id === req.params.personId);
  if (!person) return res.status(404).json({ error: 'Person not found' });

  const { name, title, department, photo, managerId, sponsorIds, tags, edgeColor, backgroundColor, colorLabel, notes, position } = req.body ?? {};

  if (managerId !== undefined) {
    if (managerId !== null) {
      if (!chart.people.some((p) => p.id === managerId)) {
        return res.status(400).json({ error: 'managerId does not exist in this chart' });
      }
      if (isSelfOrDescendant(chart.people, person.id, managerId)) {
        return res.status(400).json({ error: 'Cannot set manager to self or a descendant (would create a cycle)' });
      }
    }
    person.managerId = managerId;
  }
  try {
    if (name !== undefined) person.name = requireNonEmptyString(name, 'name');
    if (title !== undefined) person.title = requireString(title, 'title');
    if (department !== undefined) person.department = requireString(department, 'department');
    if (photo !== undefined) person.photo = parsePhotoField(photo);
    if (sponsorIds !== undefined) person.sponsorIds = requireStringArray(sponsorIds, 'sponsorIds');
    if (tags !== undefined) person.tags = requireStringArray(tags, 'tags');
    if (colorLabel !== undefined) person.colorLabel = requireString(colorLabel, 'colorLabel').trim();
    if (notes !== undefined) person.notes = parseNotesField(notes);
    if (position !== undefined) person.position = requirePosition(position);
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    throw err;
  }
  if (edgeColor !== undefined) person.edgeColor = parseColorField(edgeColor);
  if (backgroundColor !== undefined) person.backgroundColor = parseColorField(backgroundColor);
  person.updatedAt = new Date().toISOString();

  saveChart(chart);
  res.json(person);
});

// DELETE /api/charts/:id/people/:personId - delete, reparenting subordinates
router.delete('/:id/people/:personId', (req, res) => {
  const chart = loadChart(req.params.id);
  if (!chart) return res.status(404).json({ error: 'Chart not found' });
  const person = chart.people.find((p) => p.id === req.params.personId);
  if (!person) return res.status(404).json({ error: 'Person not found' });

  // Reparent direct subordinates to the deleted person's manager (or make them roots).
  const now = new Date().toISOString();
  chart.people.forEach((p) => {
    if (p.managerId === person.id) {
      p.managerId = person.managerId;
      p.updatedAt = now;
    }
  });
  chart.people = chart.people.filter((p) => p.id !== person.id);
  saveChart(chart);
  garbageCollectPhotos();
  res.status(204).end();
});

export default router;
