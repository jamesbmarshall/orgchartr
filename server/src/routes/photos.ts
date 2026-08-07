import { Router } from 'express';
import multer, { MulterError } from 'multer';
import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { PHOTOS_DIR } from '../lib/dataStore';
import { sniffImageExtension } from '../lib/images';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// Buffer the upload in memory so we can verify its real content before writing anything to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // MIME is client-supplied and easily forged, so it is only an early reject; the magic-byte
    // check below is what actually decides the stored type.
    cb(null, ALLOWED_MIME.has(file.mimetype));
  },
});

const router = Router();

router.post('/', (req, res) => {
  upload.single('photo')(req, res, (err) => {
    if (err instanceof MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'The photo is larger than the 5 MB limit.' : 'Could not read the uploaded photo.';
      return res.status(status).json({ error: message });
    }
    if (err) return res.status(400).json({ error: 'Could not read the uploaded photo.' });
    if (!req.file) return res.status(400).json({ error: 'No photo file uploaded' });

    const ext = sniffImageExtension(req.file.buffer);
    if (!ext) {
      return res.status(400).json({ error: 'Unsupported file type. Use JPEG, PNG, WEBP, or GIF.' });
    }

    const filename = `${nanoid(12)}${ext}`;
    try {
      fs.writeFileSync(path.join(PHOTOS_DIR, filename), req.file.buffer, { flag: 'wx' });
    } catch {
      return res.status(500).json({ error: 'Could not save the photo.' });
    }
    res.status(201).json({ filename });
  });
});

export default router;
