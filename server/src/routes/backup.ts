import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { DATA_DIR, CHARTS_DIR, PHOTOS_DIR, SPONSORS_FILE } from '../lib/dataStore';

const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// GET /api/backup - download a single zip archive with all charts, sponsors, and photos.
router.get('/', (_req, res) => {
  const zip = new AdmZip();
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

  const entryNames = zip.getEntries().map((entry) => entry.entryName);
  const looksLikeBackup = entryNames.includes('sponsors.json') && entryNames.includes('charts/index.json');
  if (!looksLikeBackup) {
    return res.status(400).json({ error: 'This file does not look like an orgchartr backup archive.' });
  }

  // Replace current data wholesale: clear the existing charts/photos, then extract the backup over them.
  fs.rmSync(CHARTS_DIR, { recursive: true, force: true });
  fs.rmSync(PHOTOS_DIR, { recursive: true, force: true });
  fs.mkdirSync(CHARTS_DIR, { recursive: true });
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });

  zip.extractAllTo(DATA_DIR, true);
  res.json({ ok: true });
});

export default router;
