import fs from 'fs';
import path from 'path';

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

export function readIndex() {
  return readJson<import('../types').ChartIndexEntry[]>(INDEX_FILE, []);
}

export function writeIndex(entries: import('../types').ChartIndexEntry[]): void {
  writeJsonAtomic(INDEX_FILE, entries);
}
