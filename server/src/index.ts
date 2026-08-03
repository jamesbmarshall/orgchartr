import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { ensureDataDirs, PHOTOS_DIR } from './lib/dataStore';
import chartsRouter from './routes/charts';
import sponsorsRouter from './routes/sponsors';
import photosRouter from './routes/photos';
import gitRouter from './routes/git';

ensureDataDirs();

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// In dev, the frontend runs on its own Vite dev server (different origin) and proxies /api here.
if (process.env.NODE_ENV !== 'production') {
  app.use(cors());
}

app.use(express.json({ limit: '2mb' }));

app.use('/api/charts', chartsRouter);
app.use('/api/sponsors', sponsorsRouter);
app.use('/api/photos', photosRouter);
app.use('/api/git', gitRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

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

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`orgchartr server listening on port ${PORT}`);
});
