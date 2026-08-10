import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import {
  BACKUP_FORMAT_VERSION,
  BACKUP_MANIFEST_FILE,
  BACKUP_SECTIONS,
  buildBackupManifest,
  type BackupManifest,
} from '@orgchartr/shared';
import { DATA_DIR, CHARTS_DIR, PHOTOS_DIR, SPONSORS_FILE, ensureDataDirs } from '../lib/dataStore';

const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
const MANIFEST_FILE = BACKUP_MANIFEST_FILE;
const MAX_BACKUP_ENTRIES = 10_000;
const MAX_EXPANDED_SIZE = 500 * 1024 * 1024;

function validateManifest(manifest: Partial<BackupManifest>): void {
  if (manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error(`Unsupported backup format version: ${String(manifest.formatVersion)}`);
  }
  if (typeof manifest.createdAt !== 'string' || Number.isNaN(Date.parse(manifest.createdAt))) {
    throw new Error('The backup manifest has an invalid creation date.');
  }
  if (
    !Array.isArray(manifest.sections)
    || manifest.sections.length !== BACKUP_SECTIONS.length
    || !BACKUP_SECTIONS.every((section) => manifest.sections?.includes(section))
  ) {
    throw new Error('The backup manifest does not list the expected data sections.');
  }
}

function validateEntryName(entryName: string, isDirectory: boolean): void {
  if (!entryName || entryName.includes('\\') || entryName.startsWith('/') || /^[a-z]:/i.test(entryName)) {
    throw new Error(`Unsafe backup path: ${entryName || '(empty)'}`);
  }

  const normalized = entryName.endsWith('/') ? entryName.slice(0, -1) : entryName;
  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Unsafe backup path: ${entryName}`);
  }

  if (normalized === MANIFEST_FILE || normalized === 'sponsors.json') {
    if (isDirectory) throw new Error(`Expected a file at ${entryName}`);
    return;
  }

  if (normalized === 'charts' || normalized === 'assets' || normalized === 'assets/photos') {
    if (!isDirectory) throw new Error(`Expected a directory at ${entryName}`);
    return;
  }

  if (normalized.startsWith('charts/')) {
    if (!isDirectory && !normalized.endsWith('.json')) {
      throw new Error(`Unexpected file in charts: ${entryName}`);
    }
    return;
  }

  if (normalized.startsWith('assets/photos/')) {
    const photoPath = normalized.slice('assets/photos/'.length);
    if (photoPath.includes('/')) throw new Error(`Unexpected nested photo path: ${entryName}`);
    return;
  }

  throw new Error(`Unexpected backup path: ${entryName}`);
}

function validateJsonFile(filePath: string, expectedType: 'array' | 'object'): void {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
  const valid = expectedType === 'array'
    ? Array.isArray(parsed)
    : typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  if (!valid) throw new Error(`${path.basename(filePath)} does not contain the expected JSON data.`);
}

function validateStagedData(stagingDir: string): void {
  const stagedCharts = path.join(stagingDir, 'charts');
  const stagedSponsors = path.join(stagingDir, 'sponsors.json');
  const stagedIndex = path.join(stagedCharts, 'index.json');
  if (!fs.existsSync(stagedSponsors) || !fs.existsSync(stagedIndex)) {
    throw new Error('The backup is missing sponsors.json or charts/index.json.');
  }

  validateJsonFile(stagedSponsors, 'array');
  validateJsonFile(stagedIndex, 'array');
  for (const filePath of fs.readdirSync(stagedCharts, { recursive: true, encoding: 'utf-8' })) {
    if (!filePath.endsWith('.json') || filePath === 'index.json') continue;
    validateJsonFile(path.join(stagedCharts, filePath), 'object');
  }

  fs.mkdirSync(path.join(stagingDir, 'assets', 'photos'), { recursive: true });
}

function replaceLiveData(stagingDir: string): void {
  const rollbackDir = fs.mkdtempSync(path.join(DATA_DIR, '.restore-rollback-'));
  const sections = [
    { live: CHARTS_DIR, staged: path.join(stagingDir, 'charts'), rollback: path.join(rollbackDir, 'charts') },
    { live: SPONSORS_FILE, staged: path.join(stagingDir, 'sponsors.json'), rollback: path.join(rollbackDir, 'sponsors.json') },
    { live: PHOTOS_DIR, staged: path.join(stagingDir, 'assets', 'photos'), rollback: path.join(rollbackDir, 'photos') },
  ];
  const movedLive: typeof sections = [];
  const installed: typeof sections = [];

  try {
    for (const section of sections) {
      if (!fs.existsSync(section.live)) continue;
      fs.mkdirSync(path.dirname(section.rollback), { recursive: true });
      fs.renameSync(section.live, section.rollback);
      movedLive.push(section);
    }
    for (const section of sections) {
      fs.mkdirSync(path.dirname(section.live), { recursive: true });
      fs.renameSync(section.staged, section.live);
      installed.push(section);
    }
  } catch (error) {
    let rollbackError: unknown = null;
    for (const section of installed.reverse()) {
      try {
        fs.rmSync(section.live, { recursive: true, force: true });
      } catch (caught) {
        rollbackError ??= caught;
      }
    }
    for (const section of movedLive.reverse()) {
      try {
        if (fs.existsSync(section.rollback)) fs.renameSync(section.rollback, section.live);
      } catch (caught) {
        rollbackError ??= caught;
      }
    }
    if (rollbackError) {
      console.error(`Restore rollback is incomplete. Recovery data remains at ${rollbackDir}.`, rollbackError);
      throw new Error('Restore failed and the previous data could not be fully recovered automatically.');
    }
    fs.rmSync(rollbackDir, { recursive: true, force: true });
    throw error;
  }

  fs.rmSync(rollbackDir, { recursive: true, force: true });
}

// GET /api/backup - download a single zip archive with all charts, sponsors, and photos.
router.get('/', (_req, res) => {
  const zip = new AdmZip();
  const manifest = buildBackupManifest();
  zip.addFile(MANIFEST_FILE, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf-8'));
  zip.addLocalFolder(CHARTS_DIR, 'charts');
  zip.addLocalFolder(PHOTOS_DIR, 'assets/photos');
  if (fs.existsSync(SPONSORS_FILE)) zip.addLocalFile(SPONSORS_FILE, '', 'sponsors.json');

  const filename = `orgchartr-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(zip.toBuffer());
});

// POST /api/backup/restore - replace all current data with the contents of an uploaded backup archive.
router.post('/restore', upload.single('backup'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No backup file uploaded' });

  let zip: AdmZip;
  try {
    zip = new AdmZip(req.file.buffer);
  } catch {
    return res.status(400).json({ error: 'That file is not a valid backup archive.' });
  }

  let stagingDir: string | null = null;
  try {
    const entries = zip.getEntries();
    if (entries.length > MAX_BACKUP_ENTRIES) throw new Error('The backup contains too many files.');

    const seenPaths = new Set<string>();
    let expandedSize = 0;
    for (const entry of entries) {
      validateEntryName(entry.entryName, entry.isDirectory);
      const canonicalPath = entry.entryName.replace(/\/$/, '').toLocaleLowerCase();
      if (seenPaths.has(canonicalPath)) throw new Error(`Duplicate backup path: ${entry.entryName}`);
      seenPaths.add(canonicalPath);
      expandedSize += entry.header.size;
      if (!Number.isSafeInteger(expandedSize) || expandedSize > MAX_EXPANDED_SIZE) {
        throw new Error('The expanded backup is too large.');
      }
    }

    const manifestEntry = zip.getEntry(MANIFEST_FILE);
    if (manifestEntry) {
      const manifest = JSON.parse(manifestEntry.getData().toString('utf-8')) as Partial<BackupManifest>;
      validateManifest(manifest);
    }

    if (!seenPaths.has('sponsors.json') || !seenPaths.has('charts/index.json')) {
      throw new Error('This file does not look like an orgchartr backup archive.');
    }

    stagingDir = fs.mkdtempSync(path.join(DATA_DIR, '.restore-staging-'));
    zip.extractAllTo(stagingDir, true);
    validateStagedData(stagingDir);
    replaceLiveData(stagingDir);
    ensureDataDirs();
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The backup could not be restored.';
    res.status(400).json({ error: message });
  } finally {
    if (stagingDir) fs.rmSync(stagingDir, { recursive: true, force: true });
  }
});

export default router;
