import { Router } from 'express';
import {
  ValidationError,
  applyPersonPatch,
  applyPositions,
  buildPerson,
  removePersonWithReparent,
  uniqueChartId,
} from '@orgchartr/shared';
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
import type { Chart } from '../types';

const router = Router();

// Reject any chart id that isn't a plain slug/nanoid segment before it reaches the filesystem.
router.param('id', (_req, res, next, id) => {
  if (!isValidChartId(id)) return res.status(400).json({ error: 'Invalid chart id' });
  next();
});

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
  const existingIds = new Set(readIndex().map((e) => e.id));
  const id = uniqueChartId(partnerName, existingIds);
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
  applyPositions(chart, positions as Record<string, unknown>, new Date().toISOString());
  saveChart(chart);
  res.json(chart);
});

// POST /api/charts/:id/people - add a person
router.post('/:id/people', (req, res) => {
  const chart = loadChart(req.params.id);
  if (!chart) return res.status(404).json({ error: 'Chart not found' });

  let person;
  try {
    person = buildPerson(req.body ?? {}, chart.people, new Date().toISOString());
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

  try {
    applyPersonPatch(chart, person, req.body ?? {}, new Date().toISOString());
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    throw err;
  }

  saveChart(chart);
  res.json(person);
});

// DELETE /api/charts/:id/people/:personId - delete, reparenting subordinates
router.delete('/:id/people/:personId', (req, res) => {
  const chart = loadChart(req.params.id);
  if (!chart) return res.status(404).json({ error: 'Chart not found' });
  const found = removePersonWithReparent(chart, req.params.personId, new Date().toISOString());
  if (!found) return res.status(404).json({ error: 'Person not found' });
  saveChart(chart);
  garbageCollectPhotos();
  res.status(204).end();
});

export default router;
