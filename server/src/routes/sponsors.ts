import { Router } from 'express';
import { nanoid } from 'nanoid';
import {
  loadSponsors,
  saveSponsors,
  listChartIds,
  loadChart,
  saveChart,
  garbageCollectPhotos,
  computeSponsorUsage,
} from '../lib/dataStore';
import type { Sponsor } from '../types';
import { isStoredPhotoName } from '../lib/images';
import { ValidationError, requireNonEmptyString, requireString, requireStringArray } from '../lib/validation';

const router = Router();

function parsePhotoField(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (!isStoredPhotoName(value)) throw new ValidationError('photo must be a valid uploaded photo reference');
  return value;
}

router.get('/', (_req, res) => {
  res.json(loadSponsors());
});

// GET /api/sponsors/usage - which people/charts currently reference each sponsor
router.get('/usage', (_req, res) => {
  res.json(computeSponsorUsage());
});

router.post('/', (req, res) => {
  const { name, title, department, photo, tags } = req.body ?? {};
  const sponsors = loadSponsors();
  const now = new Date().toISOString();
  let sponsor: Sponsor;
  try {
    sponsor = {
      id: nanoid(10),
      name: requireNonEmptyString(name, 'name'),
      title: title === undefined ? '' : requireString(title, 'title'),
      department: department === undefined ? '' : requireString(department, 'department'),
      photo: parsePhotoField(photo),
      tags: tags === undefined ? [] : requireStringArray(tags, 'tags'),
      createdAt: now,
      updatedAt: now,
    };
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    throw err;
  }
  sponsors.push(sponsor);
  saveSponsors(sponsors);
  res.status(201).json(sponsor);
});

router.put('/:id', (req, res) => {
  const sponsors = loadSponsors();
  const sponsor = sponsors.find((s) => s.id === req.params.id);
  if (!sponsor) return res.status(404).json({ error: 'Sponsor not found' });

  const { name, title, department, photo, tags } = req.body ?? {};
  try {
    if (name !== undefined) sponsor.name = requireNonEmptyString(name, 'name');
    if (title !== undefined) sponsor.title = requireString(title, 'title');
    if (department !== undefined) sponsor.department = requireString(department, 'department');
    if (photo !== undefined) sponsor.photo = parsePhotoField(photo);
    if (tags !== undefined) sponsor.tags = requireStringArray(tags, 'tags');
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    throw err;
  }
  sponsor.updatedAt = new Date().toISOString();

  saveSponsors(sponsors);
  res.json(sponsor);
});

router.delete('/:id', (req, res) => {
  const sponsors = loadSponsors();
  const idx = sponsors.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Sponsor not found' });
  sponsors.splice(idx, 1);
  saveSponsors(sponsors);

  // Strip this sponsor from any person that referenced it, across every chart.
  for (const chartId of listChartIds()) {
    const chart = loadChart(chartId);
    if (!chart) continue;
    let changed = false;
    for (const person of chart.people) {
      if (person.sponsorIds.includes(req.params.id)) {
        person.sponsorIds = person.sponsorIds.filter((sponsorId) => sponsorId !== req.params.id);
        person.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) saveChart(chart);
  }

  garbageCollectPhotos();
  res.status(204).end();
});

export default router;
