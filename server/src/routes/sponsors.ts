import { Router } from 'express';
import { ValidationError, applySponsorPatch, buildSponsor } from '@orgchartr/shared';
import {
  loadSponsors,
  saveSponsors,
  listChartIds,
  loadChart,
  saveChart,
  garbageCollectPhotos,
  computeSponsorUsage,
} from '../lib/dataStore';

const router = Router();

router.get('/', (_req, res) => {
  res.json(loadSponsors());
});

// GET /api/sponsors/usage - which people/charts currently reference each sponsor
router.get('/usage', (_req, res) => {
  res.json(computeSponsorUsage());
});

router.post('/', (req, res) => {
  const sponsors = loadSponsors();
  let sponsor;
  try {
    sponsor = buildSponsor(req.body ?? {}, new Date().toISOString());
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

  try {
    applySponsorPatch(sponsor, req.body ?? {}, new Date().toISOString());
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    throw err;
  }

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
