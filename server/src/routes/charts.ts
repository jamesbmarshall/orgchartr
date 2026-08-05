import { Router } from 'express';
import { nanoid } from 'nanoid';
import {
  chartFilePath,
  readIndex,
  writeIndex,
  readJson,
  writeJsonAtomic,
} from '../lib/dataStore';
import type { Chart, ChartIndexEntry, Person } from '../types';
import fs from 'fs';

const router = Router();

type StoredPerson = Omit<Person, 'sponsorIds'> & {
  sponsorIds?: string[];
  sponsorId?: string | null;
  edgeColor?: string | null;
  backgroundColor?: string | null;
  colorLabel?: string;
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const LEGACY_DEFAULT_BACKGROUND = '#1a1d24';

function parseColor(value: unknown): string | null {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : null;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base || 'chart';
}

function loadChart(id: string): Chart | null {
  const filePath = chartFilePath(id);
  if (!fs.existsSync(filePath)) return null;
  const chart = readJson<Omit<Chart, 'people'> & { people: StoredPerson[] }>(filePath, {
    id,
    partnerName: id,
    people: [],
  });
  return {
    ...chart,
    people: chart.people.map(({ sponsorId, ...person }) => ({
      ...person,
      sponsorIds: Array.isArray(person.sponsorIds) ? person.sponsorIds : sponsorId ? [sponsorId] : [],
      edgeColor: parseColor(person.edgeColor),
      backgroundColor: person.backgroundColor?.toLocaleLowerCase() === LEGACY_DEFAULT_BACKGROUND
        ? null
        : parseColor(person.backgroundColor),
      colorLabel: typeof person.colorLabel === 'string' ? person.colorLabel : '',
    })),
  };
}

function saveChart(chart: Chart): void {
  writeJsonAtomic(chartFilePath(chart.id), chart);
  const index = readIndex();
  const entry: ChartIndexEntry = {
    id: chart.id,
    partnerName: chart.partnerName,
    personCount: chart.people.length,
    lastUpdated: new Date().toISOString(),
  };
  const existingIdx = index.findIndex((e) => e.id === chart.id);
  if (existingIdx >= 0) index[existingIdx] = entry;
  else index.push(entry);
  writeIndex(index);
}

/** Returns true if `candidateId` is `personId` itself or a descendant of it (would create a cycle). */
function isSelfOrDescendant(people: Person[], personId: string, candidateId: string): boolean {
  if (personId === candidateId) return true;
  const children = people.filter((p) => p.managerId === personId);
  return children.some((c) => isSelfOrDescendant(people, c.id, candidateId));
}

// GET /api/charts - index of all charts
router.get('/', (_req, res) => {
  res.json(readIndex());
});

// POST /api/charts - create a new (empty) chart
router.post('/', (req, res) => {
  const { partnerName } = req.body ?? {};
  if (!partnerName || typeof partnerName !== 'string') {
    return res.status(400).json({ error: 'partnerName is required' });
  }
  let id = slugify(partnerName);
  const index = readIndex();
  if (index.some((e) => e.id === id)) {
    id = `${id}-${nanoid(5).toLowerCase()}`;
  }
  const chart: Chart = { id, partnerName, people: [] };
  saveChart(chart);
  res.status(201).json(chart);
});

// GET /api/charts/:id
router.get('/:id', (req, res) => {
  const chart = loadChart(req.params.id);
  if (!chart) return res.status(404).json({ error: 'Chart not found' });
  res.json(chart);
});

// PATCH /api/charts/:id - rename
router.patch('/:id', (req, res) => {
  const chart = loadChart(req.params.id);
  if (!chart) return res.status(404).json({ error: 'Chart not found' });
  const { partnerName } = req.body ?? {};
  if (typeof partnerName === 'string' && partnerName.trim()) {
    chart.partnerName = partnerName.trim();
  }
  saveChart(chart);
  res.json(chart);
});

// DELETE /api/charts/:id
router.delete('/:id', (req, res) => {
  const filePath = chartFilePath(req.params.id);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Chart not found' });
  fs.rmSync(filePath);
  const index = readIndex().filter((e) => e.id !== req.params.id);
  writeIndex(index);
  res.status(204).end();
});

// POST /api/charts/:id/people - add a person
router.post('/:id/people', (req, res) => {
  const chart = loadChart(req.params.id);
  if (!chart) return res.status(404).json({ error: 'Chart not found' });

  const { name, title, department, photo, managerId, sponsorIds, tags, edgeColor, backgroundColor, colorLabel } = req.body ?? {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }
  if (managerId && !chart.people.some((p) => p.id === managerId)) {
    return res.status(400).json({ error: 'managerId does not exist in this chart' });
  }

  const person: Person = {
    id: nanoid(10),
    name,
    title: title ?? '',
    department: department ?? '',
    photo: photo ?? null,
    managerId: managerId ?? null,
    sponsorIds: Array.isArray(sponsorIds) ? sponsorIds.filter((id): id is string => typeof id === 'string') : [],
    tags: Array.isArray(tags) ? tags : [],
    edgeColor: parseColor(edgeColor),
    backgroundColor: parseColor(backgroundColor),
    colorLabel: typeof colorLabel === 'string' ? colorLabel.trim() : '',
    position: null,
  };
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

  const { name, title, department, photo, managerId, sponsorIds, tags, edgeColor, backgroundColor, colorLabel, position } = req.body ?? {};

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
  if (name !== undefined) person.name = name;
  if (title !== undefined) person.title = title;
  if (department !== undefined) person.department = department;
  if (photo !== undefined) person.photo = photo;
  if (sponsorIds !== undefined && Array.isArray(sponsorIds)) {
    person.sponsorIds = sponsorIds.filter((id): id is string => typeof id === 'string');
  }
  if (tags !== undefined) person.tags = Array.isArray(tags) ? tags : person.tags;
  if (edgeColor !== undefined) person.edgeColor = parseColor(edgeColor);
  if (backgroundColor !== undefined) person.backgroundColor = parseColor(backgroundColor);
  if (colorLabel !== undefined && typeof colorLabel === 'string') person.colorLabel = colorLabel.trim();
  if (position !== undefined) person.position = position;

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
  chart.people.forEach((p) => {
    if (p.managerId === person.id) p.managerId = person.managerId;
  });
  chart.people = chart.people.filter((p) => p.id !== person.id);
  saveChart(chart);
  res.status(204).end();
});

export default router;
