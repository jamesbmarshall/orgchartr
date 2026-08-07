import { Router } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import {
  PHOTOS_DIR,
  chartFilePath,
  deleteChartFile,
  loadChart,
  loadSponsors,
  readIndex,
  saveChart,
  saveSponsors,
} from '../lib/dataStore';
import type { Chart, Person, Sponsor } from '../types';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const MANIFEST_FILE = 'orgchartr-package.json';
const CHART_FILE = 'chart.json';
const SPONSORS_FILE = 'sponsors.json';
const PACKAGE_FORMAT_VERSION = 1;
const MAX_PACKAGE_ENTRIES = 10_000;
const MAX_EXPANDED_SIZE = 500 * 1024 * 1024;
const ALLOWED_PHOTO_EXTENSIONS = new Set(['.gif', '.jpeg', '.jpg', '.png', '.webp']);

interface PackageManifest {
  formatVersion: number;
  createdAt: string;
  type: 'orgchartr-chart';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'chart';
}

function uniqueChartId(partnerName: string): string {
  const base = slugify(partnerName);
  const existingIds = new Set(readIndex().map((entry) => entry.id));
  let id = base;
  while (existingIds.has(id)) id = `${base}-${nanoid(5).toLowerCase()}`;
  return id;
}

function plainPhotoFilename(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || path.basename(value) !== value || value.includes(path.win32.sep)) {
    throw new Error('The package contains an invalid photo mapping.');
  }
  if (!ALLOWED_PHOTO_EXTENSIONS.has(path.extname(value).toLowerCase())) {
    throw new Error(`Unsupported photo type: ${value}`);
  }
  return value;
}

function nullableTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error('The package contains an invalid timestamp.');
  }
  return value;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`The package has an invalid ${field} mapping.`);
  }
  return value;
}

function nullableColor(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error('The package contains an invalid colour value.');
  }
  return value;
}

function parsePerson(value: unknown): Person {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string' || !value.name.trim()) {
    throw new Error('The package contains an invalid person record.');
  }
  const managerId = value.managerId === null || value.managerId === undefined
    ? null
    : typeof value.managerId === 'string' ? value.managerId : null;
  if (value.managerId !== null && value.managerId !== undefined && managerId === null) {
    throw new Error('The package contains an invalid manager mapping.');
  }
  let position: Person['position'] = null;
  if (value.position !== null && value.position !== undefined) {
    if (
      !isRecord(value.position)
      || typeof value.position.x !== 'number'
      || !Number.isFinite(value.position.x)
      || typeof value.position.y !== 'number'
      || !Number.isFinite(value.position.y)
    ) {
      throw new Error('The package contains an invalid chart position.');
    }
    position = { x: value.position.x, y: value.position.y };
  }
  return {
    id: value.id,
    name: value.name.trim(),
    title: typeof value.title === 'string' ? value.title : '',
    department: typeof value.department === 'string' ? value.department : '',
    photo: plainPhotoFilename(value.photo),
    managerId,
    sponsorIds: stringArray(value.sponsorIds, 'sponsor'),
    tags: stringArray(value.tags, 'tag'),
    edgeColor: nullableColor(value.edgeColor),
    backgroundColor: nullableColor(value.backgroundColor),
    colorLabel: typeof value.colorLabel === 'string' ? value.colorLabel : '',
    notes: typeof value.notes === 'string' ? value.notes.slice(0, 4000) : '',
    position,
    createdAt: nullableTimestamp(value.createdAt),
    updatedAt: nullableTimestamp(value.updatedAt),
  };
}

function parseChart(value: unknown): Chart {
  if (!isRecord(value) || typeof value.partnerName !== 'string' || !value.partnerName.trim() || !Array.isArray(value.people)) {
    throw new Error('chart.json does not contain a valid org chart.');
  }
  const people = value.people.map(parsePerson);
  const personIds = new Set(people.map((person) => person.id));
  if (personIds.size !== people.length) throw new Error('The package contains duplicate person IDs.');
  if (people.some((person) => person.managerId && !personIds.has(person.managerId))) {
    throw new Error('The package contains a manager mapping outside the chart.');
  }
  const complete = new Set<string>();
  const visiting = new Set<string>();
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const visit = (personId: string): void => {
    if (complete.has(personId)) return;
    if (visiting.has(personId)) throw new Error('The package contains a cycle in its manager mappings.');
    visiting.add(personId);
    const managerId = peopleById.get(personId)?.managerId;
    if (managerId) visit(managerId);
    visiting.delete(personId);
    complete.add(personId);
  };
  people.forEach((person) => visit(person.id));
  return {
    id: '',
    partnerName: value.partnerName.trim(),
    description: typeof value.description === 'string' ? value.description : '',
    people,
  };
}

function parseSponsor(value: unknown): Sponsor {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string' || !value.name.trim()) {
    throw new Error('The package contains an invalid sponsor record.');
  }
  return {
    id: value.id,
    name: value.name.trim(),
    title: typeof value.title === 'string' ? value.title : '',
    department: typeof value.department === 'string' ? value.department : '',
    photo: plainPhotoFilename(value.photo),
    tags: stringArray(value.tags, 'sponsor tag'),
    createdAt: nullableTimestamp(value.createdAt),
    updatedAt: nullableTimestamp(value.updatedAt),
  };
}

function validateEntryName(entryName: string, isDirectory: boolean): void {
  if (!entryName || entryName.includes(path.win32.sep) || entryName.startsWith('/') || /^[a-z]:/i.test(entryName)) {
    throw new Error(`Unsafe package path: ${entryName || '(empty)'}`);
  }
  const normalized = entryName.endsWith('/') ? entryName.slice(0, -1) : entryName;
  if (normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Unsafe package path: ${entryName}`);
  }
  if ([MANIFEST_FILE, CHART_FILE, SPONSORS_FILE].includes(normalized)) {
    if (isDirectory) throw new Error(`Expected a file at ${entryName}`);
    return;
  }
  if (normalized === 'assets' || normalized === 'assets/photos') {
    if (!isDirectory) throw new Error(`Expected a directory at ${entryName}`);
    return;
  }
  if (normalized.startsWith('assets/photos/')) {
    if (isDirectory || normalized.slice('assets/photos/'.length).includes('/')) {
      throw new Error(`Unexpected photo path: ${entryName}`);
    }
    plainPhotoFilename(normalized.slice('assets/photos/'.length));
    return;
  }
  throw new Error(`Unexpected package path: ${entryName}`);
}

function mappedPhoto(photo: string | null, mapping: Map<string, string>): string | null {
  return photo ? mapping.get(photo) ?? null : null;
}

function validatePhotoData(filename: string, data: Buffer): void {
  const extension = path.extname(filename).toLowerCase();
  const valid = extension === '.png'
    ? data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : extension === '.jpg' || extension === '.jpeg'
      ? data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
      : extension === '.gif'
        ? ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('ascii'))
        : extension === '.webp'
          ? data.length >= 12
            && data.subarray(0, 4).toString('ascii') === 'RIFF'
            && data.subarray(8, 12).toString('ascii') === 'WEBP'
          : false;
  if (!valid) throw new Error(`The package contains an invalid image asset: ${filename}`);
}

// POST /api/packages/export/:chartId - download one chart and its referenced sponsors/photos.
router.post('/export/:chartId', (req, res) => {
  const chart = loadChart(req.params.chartId);
  if (!chart) return res.status(404).json({ error: 'Chart not found' });
  const personIds = req.body?.personIds;
  if (!Array.isArray(personIds) || personIds.length === 0 || personIds.some((id) => typeof id !== 'string')) {
    return res.status(400).json({ error: 'Select at least one person to export.' });
  }
  const selectedIds = new Set<string>(personIds);
  if ([...selectedIds].some((id) => !chart.people.some((person) => person.id === id))) {
    return res.status(400).json({ error: 'The export selection contains a person outside this chart.' });
  }

  const sponsorsById = new Map(loadSponsors().map((sponsor) => [sponsor.id, sponsor]));
  const sponsorIds = new Set<string>();
  const photos = new Set<string>();
  const includePhoto = (photo: string | null): string | null => {
    if (!photo || path.basename(photo) !== photo || !fs.existsSync(path.join(PHOTOS_DIR, photo))) return null;
    photos.add(photo);
    return photo;
  };
  const people = chart.people
    .filter((person) => selectedIds.has(person.id))
    .map((person) => {
      const validSponsorIds = person.sponsorIds.filter((id) => sponsorsById.has(id));
      validSponsorIds.forEach((id) => sponsorIds.add(id));
      return {
        ...person,
        photo: includePhoto(person.photo),
        managerId: person.managerId && selectedIds.has(person.managerId) ? person.managerId : null,
        sponsorIds: validSponsorIds,
      };
    });
  const sponsors = [...sponsorIds].map((id) => {
    const sponsor = sponsorsById.get(id)!;
    return { ...sponsor, photo: includePhoto(sponsor.photo) };
  });
  const packagedChart: Chart = { ...chart, people };
  const manifest: PackageManifest = {
    formatVersion: PACKAGE_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    type: 'orgchartr-chart',
  };

  const zip = new AdmZip();
  zip.addFile(MANIFEST_FILE, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf-8'));
  zip.addFile(CHART_FILE, Buffer.from(`${JSON.stringify(packagedChart, null, 2)}\n`, 'utf-8'));
  zip.addFile(SPONSORS_FILE, Buffer.from(`${JSON.stringify(sponsors, null, 2)}\n`, 'utf-8'));
  photos.forEach((photo) => zip.addLocalFile(path.join(PHOTOS_DIR, photo), 'assets/photos', photo));
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${slugify(chart.partnerName)}.orgchartr.zip"`);
  res.send(zip.toBuffer());
});

// POST /api/packages/import - validate and add a portable chart package without replacing existing data.
router.post('/import', upload.single('package'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No chart package uploaded' });
  let zip: AdmZip;
  try {
    zip = new AdmZip(req.file.buffer);
  } catch {
    return res.status(400).json({ error: 'That file is not a valid chart package.' });
  }

  const originalSponsors = loadSponsors();
  const createdPhotos: string[] = [];
  let importedChartId: string | null = null;
  let sponsorsSaved = false;
  try {
    const entries = zip.getEntries();
    if (entries.length > MAX_PACKAGE_ENTRIES) throw new Error('The package contains too many files.');
    const seenPaths = new Set<string>();
    let expandedSize = 0;
    for (const entry of entries) {
      validateEntryName(entry.entryName, entry.isDirectory);
      const canonicalPath = entry.entryName.replace(/\/$/, '').toLocaleLowerCase();
      if (seenPaths.has(canonicalPath)) throw new Error(`Duplicate package path: ${entry.entryName}`);
      seenPaths.add(canonicalPath);
      expandedSize += entry.header.size;
      if (!Number.isSafeInteger(expandedSize) || expandedSize > MAX_EXPANDED_SIZE) {
        throw new Error('The expanded package is too large.');
      }
    }
    if (![MANIFEST_FILE, CHART_FILE, SPONSORS_FILE].every((name) => seenPaths.has(name))) {
      throw new Error('This file does not look like an orgchartr chart package.');
    }

    const manifest = JSON.parse(zip.getEntry(MANIFEST_FILE)!.getData().toString('utf-8')) as unknown;
    if (
      !isRecord(manifest)
      || manifest.formatVersion !== PACKAGE_FORMAT_VERSION
      || manifest.type !== 'orgchartr-chart'
      || typeof manifest.createdAt !== 'string'
      || Number.isNaN(Date.parse(manifest.createdAt))
    ) {
      throw new Error('The chart package manifest is invalid or unsupported.');
    }
    const chart = parseChart(JSON.parse(zip.getEntry(CHART_FILE)!.getData().toString('utf-8')) as unknown);
    const sponsorData = JSON.parse(zip.getEntry(SPONSORS_FILE)!.getData().toString('utf-8')) as unknown;
    if (!Array.isArray(sponsorData)) throw new Error('sponsors.json does not contain a sponsor list.');
    const packageSponsors = sponsorData.map(parseSponsor);
    const packageSponsorIds = new Set(packageSponsors.map((sponsor) => sponsor.id));
    if (packageSponsorIds.size !== packageSponsors.length) throw new Error('The package contains duplicate sponsor IDs.');
    if (chart.people.some((person) => person.sponsorIds.some((id) => !packageSponsorIds.has(id)))) {
      throw new Error('The package contains a sponsor mapping without sponsor data.');
    }

    const referencedPhotos = new Set([
      ...chart.people.flatMap((person) => person.photo ? [person.photo] : []),
      ...packageSponsors.flatMap((sponsor) => sponsor.photo ? [sponsor.photo] : []),
    ]);
    const photoMapping = new Map<string, string>();
    for (const sourceName of referencedPhotos) {
      const entry = zip.getEntry(`assets/photos/${sourceName}`);
      if (!entry || entry.isDirectory) throw new Error(`The package is missing photo asset: ${sourceName}`);
      const data = entry.getData();
      validatePhotoData(sourceName, data);
      const targetName = `${nanoid(12)}${path.extname(sourceName).toLowerCase()}`;
      fs.writeFileSync(path.join(PHOTOS_DIR, targetName), data, { flag: 'wx' });
      createdPhotos.push(targetName);
      photoMapping.set(sourceName, targetName);
    }

    const nextSponsors = [...originalSponsors];
    const existingById = new Map(nextSponsors.map((sponsor) => [sponsor.id, sponsor]));
    const existingByName = new Map(nextSponsors.map((sponsor) => [sponsor.name.toLocaleLowerCase(), sponsor]));
    const sponsorMapping = new Map<string, string>();
    for (const sponsor of packageSponsors) {
      const sameId = existingById.get(sponsor.id);
      const existing = sameId?.name.toLocaleLowerCase() === sponsor.name.toLocaleLowerCase()
        ? sameId
        : existingByName.get(sponsor.name.toLocaleLowerCase());
      if (existing) {
        sponsorMapping.set(sponsor.id, existing.id);
        continue;
      }
      const id = sameId ? nanoid(10) : sponsor.id;
      const imported = { ...sponsor, id, photo: mappedPhoto(sponsor.photo, photoMapping) };
      nextSponsors.push(imported);
      existingById.set(id, imported);
      existingByName.set(imported.name.toLocaleLowerCase(), imported);
      sponsorMapping.set(sponsor.id, id);
    }

    importedChartId = uniqueChartId(chart.partnerName);
    const importedChart: Chart = {
      ...chart,
      id: importedChartId,
      people: chart.people.map((person) => ({
        ...person,
        photo: mappedPhoto(person.photo, photoMapping),
        sponsorIds: person.sponsorIds.map((id) => sponsorMapping.get(id)!),
      })),
    };
    const retainedPhotos = new Set([
      ...importedChart.people.flatMap((person) => person.photo ? [person.photo] : []),
      ...nextSponsors.flatMap((sponsor) => sponsor.photo ? [sponsor.photo] : []),
    ]);
    createdPhotos
      .filter((photo) => !retainedPhotos.has(photo))
      .forEach((photo) => fs.rmSync(path.join(PHOTOS_DIR, photo), { force: true }));

    saveSponsors(nextSponsors);
    sponsorsSaved = true;
    saveChart(importedChart);
    res.status(201).json(importedChart);
  } catch (error) {
    if (importedChartId && fs.existsSync(chartFilePath(importedChartId))) {
      try { deleteChartFile(importedChartId); } catch { /* Best-effort rollback. */ }
    }
    if (sponsorsSaved) {
      try { saveSponsors(originalSponsors); } catch { /* Best-effort rollback. */ }
    }
    createdPhotos.forEach((photo) => {
      try { fs.rmSync(path.join(PHOTOS_DIR, photo), { force: true }); } catch { /* Best-effort rollback. */ }
    });
    const message = error instanceof Error ? error.message : 'The chart package could not be imported.';
    res.status(400).json({ error: message });
  }
});

export default router;
