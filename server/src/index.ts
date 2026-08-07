import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { ensureDataDirs, PHOTOS_DIR, DATA_DIR } from './lib/dataStore';
import chartsRouter from './routes/charts';
import sponsorsRouter from './routes/sponsors';
import photosRouter from './routes/photos';
import backupRouter from './routes/backup';
import packagesRouter from './routes/packages';

ensureDataDirs();

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// Don't advertise the framework.
app.disable('x-powered-by');

// Baseline hardening headers. nosniff stops a stored upload from being reinterpreted as active
// content (e.g. HTML/SVG) even if a wrong Content-Type ever slips through.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// In dev, the frontend runs on its own Vite dev server (different origin) and proxies /api here.
if (!isProduction) {
  app.use(cors());
}

// CSRF defence for the production single-origin deployment: the built frontend is served from the
// same origin as the API, so a legitimate state-changing request always carries a same-origin
// Origin header (or none, for non-browser clients). A cross-origin Origin means a page the user
// merely visited is trying to POST to their local install - reject it. Skipped in dev, where the
// Vite proxy legitimately forwards a different Origin and CORS is already open.
if (isProduction) {
  const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  app.use((req, res, next) => {
    if (!MUTATING_METHODS.has(req.method)) return next();
    const origin = req.headers.origin;
    if (!origin) return next();
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return res.status(403).json({ error: 'Request blocked: invalid origin.' });
    }
    if (originHost !== req.headers.host) {
      return res.status(403).json({ error: 'Request blocked: cross-origin request rejected.' });
    }
    next();
  });
}

app.use(express.json({ limit: '2mb' }));

app.use('/api/charts', chartsRouter);
app.use('/api/sponsors', sponsorsRouter);
app.use('/api/photos', photosRouter);
app.use('/api/backup', backupRouter);
app.use('/api/packages', packagesRouter);

app.get('/api/health', (_req, res) => {
  // A broken/read-only bind mount is the most likely real failure, so actually probe the data dir.
  try {
    fs.accessSync(DATA_DIR, fs.constants.W_OK);
  } catch {
    return res.status(503).json({ ok: false, error: 'Data directory is not writable.' });
  }
  res.json({ ok: true });
});

// Serve uploaded photos.
app.use('/photos', express.static(PHOTOS_DIR));

// In production, serve the built frontend as static files (single-container setup).
const FRONTEND_DIST = process.env.FRONTEND_DIST
  ? path.resolve(process.env.FRONTEND_DIST)
  : path.resolve(__dirname, '../../frontend/dist');

if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/photos')) return next();
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

app.use((err: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(err);
  // Map upload-size/parse failures to 4xx instead of a 500. Everything else returns a generic
  // message so filesystem paths and other internals in err.message never reach the client.
  if (err && err.name === 'MulterError') {
    const code = (err as unknown as { code?: string }).code;
    const status = code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({
      error: code === 'LIMIT_FILE_SIZE' ? 'The uploaded file is too large.' : 'Could not read the uploaded file.',
    });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`orgchartr server listening on port ${PORT}`);
});
