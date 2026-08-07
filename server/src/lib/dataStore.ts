import fs from 'fs';
import path from 'path';
import type { Chart, ChartHistoryEntry, ChartIndexEntry, Person, Sponsor } from '../types';

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

/**
 * Chart IDs are produced by slugify() + optional nanoid suffix, so they only ever contain
 * lowercase letters, digits, and hyphens. Enforcing that shape keeps a request-supplied id from
 * ever escaping CHARTS_DIR via path segments like "../" or absolute/Windows paths.
 */
const CHART_ID_PATTERN = /^[a-z0-9-]+$/;

export function isValidChartId(id: unknown): id is string {
  return typeof id === 'string' && CHART_ID_PATTERN.test(id) && id === path.basename(id);
}

/** Backstop for the filesystem helpers: refuses any id that isn't a plain chart-id segment. */
function assertValidChartId(id: string): void {
  if (!isValidChartId(id)) {
    throw new Error(`Invalid chart id: ${id}`);
  }
}

export function chartFilePath(id: string): string {
  assertValidChartId(id);
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

type StoredPerson = Omit<Person, 'sponsorIds' | 'notes' | 'createdAt' | 'updatedAt'> & {
  sponsorIds?: string[];
  sponsorId?: string | null;
  edgeColor?: string | null;
  backgroundColor?: string | null;
  colorLabel?: string;
  notes?: string;
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
  const chart = readJson<Omit<Chart, 'people' | 'description'> & { people: StoredPerson[]; description?: string }>(
    filePath,
    { id, partnerName: id, people: [] },
  );
  return {
    ...chart,
    description: typeof chart.description === 'string' ? chart.description : '',
    people: chart.people.map(({ sponsorId, ...person }) => ({
      ...person,
      sponsorIds: Array.isArray(person.sponsorIds) ? person.sponsorIds : sponsorId ? [sponsorId] : [],
      edgeColor: parseColor(person.edgeColor),
      backgroundColor: person.backgroundColor?.toLocaleLowerCase() === LEGACY_DEFAULT_BACKGROUND
        ? null
        : parseColor(person.backgroundColor),
      colorLabel: typeof person.colorLabel === 'string' ? person.colorLabel : '',
      notes: typeof person.notes === 'string' ? person.notes : '',
      createdAt: typeof person.createdAt === 'string' ? person.createdAt : null,
      updatedAt: typeof person.updatedAt === 'string' ? person.updatedAt : null,
    })),
  };
}

const CHART_HISTORY_DIR = path.join(CHARTS_DIR, 'history');
/** Minimum time between automatic snapshots for the same chart, to bound history size. */
const SNAPSHOT_MIN_INTERVAL_MS = 5 * 60 * 1000;
/** Snapshots kept per chart before the oldest is pruned. */
const MAX_HISTORY_SNAPSHOTS = 30;

function chartHistoryDir(id: string): string {
  assertValidChartId(id);
  return path.join(CHART_HISTORY_DIR, id);
}

function listSnapshotEpochs(id: string): number[] {
  const dir = chartHistoryDir(id);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => Number(f.replace('.json', '')))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
}

/**
 * Copies the chart's current on-disk content into its history folder, so it can be browsed and
 * restored later. Throttled to at most once every SNAPSHOT_MIN_INTERVAL_MS per chart (unless
 * `force` is set, used as a safety net right before a destructive restore). Call this BEFORE
 * overwriting the chart file with new content - it snapshots what's about to be replaced.
 */
function snapshotChartHistory(id: string, force = false): void {
  const filePath = chartFilePath(id);
  if (!fs.existsSync(filePath)) return;
  const epochs = listSnapshotEpochs(id);
  const now = Date.now();
  const last = epochs[epochs.length - 1];
  if (!force && last && now - last < SNAPSHOT_MIN_INTERVAL_MS) return;
  const dir = chartHistoryDir(id);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(filePath, path.join(dir, `${now}.json`));
  const all = [...epochs, now];
  while (all.length > MAX_HISTORY_SNAPSHOTS) {
    const oldest = all.shift();
    try {
      fs.rmSync(path.join(dir, `${oldest}.json`));
    } catch {
      // Best-effort pruning; ignore snapshots that can't be removed.
    }
  }
}

/** Lists this chart's saved snapshots, newest first. */
export function listChartHistory(id: string): ChartHistoryEntry[] {
  const dir = chartHistoryDir(id);
  if (!fs.existsSync(dir)) return [];
  return listSnapshotEpochs(id)
    .map((epoch) => {
      let personCount = 0;
      try {
        const data = readJson<{ people?: unknown[] }>(path.join(dir, `${epoch}.json`), {});
        personCount = Array.isArray(data.people) ? data.people.length : 0;
      } catch {
        // Ignore an unreadable/corrupt snapshot file.
      }
      return { timestamp: new Date(epoch).toISOString(), personCount };
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/** Restores a chart to a previously-saved snapshot. Always snapshots the current state first
 * (regardless of throttling) so the restore itself can be undone via history. Returns the
 * restored, freshly-migrated chart, or null if the chart or snapshot doesn't exist. */
export function restoreChartFromHistory(id: string, timestamp: string): Chart | null {
  const epoch = Date.parse(timestamp);
  if (Number.isNaN(epoch)) return null;
  const snapshotPath = path.join(chartHistoryDir(id), `${epoch}.json`);
  if (!fs.existsSync(snapshotPath)) return null;
  snapshotChartHistory(id, true);
  const snapshot = readJson<Chart>(snapshotPath, { id, partnerName: id, description: '', people: [] });
  saveChart(snapshot);
  return loadChart(id);
}

/** Persists a chart and refreshes its index entry (person count, last-updated timestamp). */
export function saveChart(chart: Chart): void {
  snapshotChartHistory(chart.id);
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

/** Deletes a chart's file, index entry, and saved history snapshots. Does not garbage-collect
 * photos; call garbageCollectPhotos() after. */
export function deleteChartFile(id: string): boolean {
  const filePath = chartFilePath(id);
  if (!fs.existsSync(filePath)) return false;
  fs.rmSync(filePath);
  fs.rmSync(chartHistoryDir(id), { recursive: true, force: true });
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

export interface SponsorUsageEntry {
  chartId: string;
  chartName: string;
  personId: string;
  personName: string;
}

/** Builds a map of sponsorId -> the people (across all charts) currently linked to it. Used to
 * show "used by" info before deleting a sponsor. */
export function computeSponsorUsage(): Record<string, SponsorUsageEntry[]> {
  const usage: Record<string, SponsorUsageEntry[]> = {};
  for (const id of listChartIds()) {
    const chart = loadChart(id);
    if (!chart) continue;
    for (const person of chart.people) {
      for (const sponsorId of person.sponsorIds) {
        (usage[sponsorId] ??= []).push({
          chartId: chart.id,
          chartName: chart.partnerName,
          personId: person.id,
          personName: person.name,
        });
      }
    }
  }
  return usage;
}
