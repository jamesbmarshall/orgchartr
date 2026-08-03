import { Router } from 'express';
import { nanoid } from 'nanoid';
import { SPONSORS_FILE, readJson, writeJsonAtomic } from '../lib/dataStore';
import type { Sponsor } from '../types';

const router = Router();

function loadSponsors(): Sponsor[] {
  return readJson<Sponsor[]>(SPONSORS_FILE, []);
}

function saveSponsors(sponsors: Sponsor[]): void {
  writeJsonAtomic(SPONSORS_FILE, sponsors);
}

router.get('/', (_req, res) => {
  res.json(loadSponsors());
});

router.post('/', (req, res) => {
  const { name, title, department, photo, tags } = req.body ?? {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }
  const sponsors = loadSponsors();
  const sponsor: Sponsor = {
    id: nanoid(10),
    name,
    title: title ?? '',
    department: department ?? '',
    photo: photo ?? null,
    tags: Array.isArray(tags) ? tags : [],
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

  saveSponsors(sponsors);
  res.json(sponsor);
});

router.delete('/:id', (req, res) => {
  const sponsors = loadSponsors();
  const idx = sponsors.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Sponsor not found' });
  sponsors.splice(idx, 1);
  saveSponsors(sponsors);
  res.status(204).end();
});

export default router;
