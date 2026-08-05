import { Router } from 'express';
import { nanoid } from 'nanoid';
import {
  loadSponsors,
  saveSponsors,
  listChartIds,
  loadChart,
  saveChart,
  garbageCollectPhotos,
} from '../lib/dataStore';
import type { Sponsor } from '../types';

const router = Router();

router.get('/', (_req, res) => {
  res.json(loadSponsors());
});

router.post('/', (req, res) => {
  const { name, title, department, photo, tags } = req.body ?? {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  const sponsors = loadSponsors();
  const now = new Date().toISOString();
  const sponsor: Sponsor = {
    id: nanoid(10),
    name: name.trim(),
    title: title ?? '',
    department: department ?? '',
    photo: photo ?? null,
    tags: Array.isArray(tags) ? tags : [],
    createdAt: now,
    updatedAt: now,
  };
  sponsors.push(sponsor);
  saveSponsors(sponsors);
  res.status(201).json(sponsor);
});

router.put('/:id', (req, res) => {
  const sponsors = loadSponsors();
  const sponsor = sponsors.find((s) => s.id === req.params.id);
  if (!sponsor) return res.status(404).json({ error: 'Sponsor not found' });

  const { name, title, department, photo, tags } = req.body ?? {};
  if (name !== undefined) sponsor.name = name;
  if (title !== undefined) sponsor.title = title;
  if (department !== undefined) sponsor.department = department;
  if (photo !== undefined) sponsor.photo = photo;
  if (tags !== undefined) sponsor.tags = Array.isArray(tags) ? tags : sponsor.tags;
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
