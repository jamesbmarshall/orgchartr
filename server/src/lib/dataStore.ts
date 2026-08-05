import fs from 'fs';
import path from 'path';
import type { Chart, ChartIndexEntry, Person, Sponsor } from '../types';

// Resolve the data directory: DATA_DIR env var wins (used in Docker),
// otherwise fall back to <repo root>/data for local `npm run dev`.
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '../../../data');

export const CHARTS_DIR = path.join(DATA_DIR, 'charts');
export const SPONSORS_FILE = path.join(DATA_DIR, 'sponsors.json');
export const PHOTOS_DIR = path.join(DATA_DIR, 'assets', 'photos');
const INDEX_FILE = path.join(CHARTS_DIR, 'index.json');

export function ensureDataDirs(): void {
  fs.mkdirSync(CHARTS_DIR, { recursive: true });
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
  if (!fs.existsSync(INDEX_FILE)) {
    writeJsonAtomic(INDEX_FILE, []);
  }
  if (!fs.existsSync(SPONSORS_FILE)) {
    writeJsonAtomic(SPONSORS_FILE, []);
  }
}

export function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (!raw.trim()) return fallback;
  return JSON.parse(raw) as T;
}

/** Write JSON to disk atomically (write to temp file, then rename) to avoid corruption on crash. */
export function writeJsonAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

export function chartFilePath(id: string): string {
  return path.join(CHARTS_DIR, `${id}.json`);
}

export function readIndex(): ChartIndexEntry[] {
  return readJson<ChartIndexEntry[]>(INDEX_FILE, []);
}

export function writeIndex(entries: ChartIndexEntry[]): void {
  writeJsonAtomic(INDEX_FILE, entries);
}

export function listChartIds(): string[] {
  return readIndex().map((entry) => entry.id);
}

type StoredPerson = Omit<Person, 'sponsorIds' | 'createdAt' | 'updatedAt'> & {
  sponsorIds?: string[];
  sponsorId?: string | null;
  edgeColor?: string | null;
  backgroundColor?: string | null;
  colorLabel?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const LEGACY_DEFAULT_BACKGROUND = '#1a1d24';

export function parseColor(value: unknown): string | null {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : null;
}

/** Loads a chart from disk, migrating legacy field shapes (singular sponsorId, missing timestamps, etc). */
export function loadChart(id: string): Chart | null {
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
      createdAt: typeof person.createdAt === 'string' ? person.createdAt : null,
      updatedAt: typeof person.updatedAt === 'string' ? person.updatedAt : null,
    })),
  };
}

/** Persists a chart and refreshes its index entry (person count, last-updated timestamp). */
export function saveChart(chart: Chart): void {
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

/** Deletes a chart's file and its index entry. Does not garbage-collect photos; call garbageCollectPhotos() after. */
export function deleteChartFile(id: string): boolean {
  const filePath = chartFilePath(id);
  if (!fs.existsSync(filePath)) return false;
  fs.rmSync(filePath);
  writeIndex(readIndex().filter((e) => e.id !== id));
  return true;
}

type StoredSponsor = Omit<Sponsor, 'createdAt' | 'updatedAt'> & {
  createdAt?: string | null;
  updatedAt?: string | null;
};

export function loadSponsors(): Sponsor[] {
  const sponsors = readJson<StoredSponsor[]>(SPONSORS_FILE, []);
  return sponsors.map((sponsor) => ({
    ...sponsor,
    createdAt: typeof sponsor.createdAt === 'string' ? sponsor.createdAt : null,
    updatedAt: typeof sponsor.updatedAt === 'string' ? sponsor.updatedAt : null,
  }));
}

export function saveSponsors(sponsors: Sponsor[]): void {
  writeJsonAtomic(SPONSORS_FILE, sponsors);
}

/**
 * Removes any photo file in PHOTOS_DIR that is no longer referenced by any chart's people
 * or by any sponsor. Intended to run after chart/sponsor/person deletions.
 */
export function garbageCollectPhotos(): void {
  const used = new Set<string>();
  for (const id of listChartIds()) {
    const chart = loadChart(id);
    if (!chart) continue;
    for (const person of chart.people) {
      if (person.photo) used.add(person.photo);
    }
  }
  for (const sponsor of loadSponsors()) {
    if (sponsor.photo) used.add(sponsor.photo);
  }

  let files: string[];
  try {
    files = fs.readdirSync(PHOTOS_DIR);
  } catch {
    return;
  }
  for (const file of files) {
    if (!used.has(file)) {
      try {
        fs.rmSync(path.join(PHOTOS_DIR, file));
      } catch {
        // Best-effort cleanup; ignore files that can't be removed.
      }
    }
  }
}
