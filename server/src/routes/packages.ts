import { Router } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import {
  MAX_EXPANDED_SIZE,
  MAX_PACKAGE_ARCHIVE_SIZE,
  MAX_PACKAGE_ENTRIES,
  PACKAGE_CHART_FILE,
  PACKAGE_MANIFEST_FILE,
  PACKAGE_SPONSORS_FILE,
  buildPackageContents,
  buildPackageManifest,
  mappedPhoto,
  mergePackageSponsors,
  parsePackageChart,
  parsePackageManifest,
  parsePackageSponsor,
  randomId,
  slugify,
  sniffImageExtension,
  uniqueChartId,
  validatePackageEntryName,
} from '@orgchartr/shared';
import {
  PHOTOS_DIR,
  chartFilePath,
  deleteChartFile,
  loadChart,
  loadSponsors,
  readIndex,
  saveChart,
  saveSponsors,
  isValidChartId,
} from '../lib/dataStore';
import type { Chart } from '../types';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PACKAGE_ARCHIVE_SIZE } });

// The export route builds a filesystem path from :chartId; keep it to a plain chart-id segment.
router.param('chartId', (_req, res, next, chartId) => {
  if (!isValidChartId(chartId)) return res.status(400).json({ error: 'Invalid chart id' });
  next();
});

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

  const { chart: packagedChart, sponsors, photos } = buildPackageContents(
    chart,
    selectedIds,
    loadSponsors(),
    (photo) => path.basename(photo) === photo && fs.existsSync(path.join(PHOTOS_DIR, photo)),
  );
  const manifest = buildPackageManifest();

  const zip = new AdmZip();
  zip.addFile(PACKAGE_MANIFEST_FILE, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf-8'));
  zip.addFile(PACKAGE_CHART_FILE, Buffer.from(`${JSON.stringify(packagedChart, null, 2)}\n`, 'utf-8'));
  zip.addFile(PACKAGE_SPONSORS_FILE, Buffer.from(`${JSON.stringify(sponsors, null, 2)}\n`, 'utf-8'));
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
      validatePackageEntryName(entry.entryName, entry.isDirectory);
      const canonicalPath = entry.entryName.replace(/\/$/, '').toLocaleLowerCase();
      if (seenPaths.has(canonicalPath)) throw new Error(`Duplicate package path: ${entry.entryName}`);
      seenPaths.add(canonicalPath);
      expandedSize += entry.header.size;
      if (!Number.isSafeInteger(expandedSize) || expandedSize > MAX_EXPANDED_SIZE) {
        throw new Error('The expanded package is too large.');
      }
    }
    if (![PACKAGE_MANIFEST_FILE, PACKAGE_CHART_FILE, PACKAGE_SPONSORS_FILE].every((name) => seenPaths.has(name))) {
      throw new Error('This file does not look like an orgchartr chart package.');
    }

    parsePackageManifest(JSON.parse(zip.getEntry(PACKAGE_MANIFEST_FILE)!.getData().toString('utf-8')));
    const chart = parsePackageChart(JSON.parse(zip.getEntry(PACKAGE_CHART_FILE)!.getData().toString('utf-8')) as unknown);
    const sponsorData = JSON.parse(zip.getEntry(PACKAGE_SPONSORS_FILE)!.getData().toString('utf-8')) as unknown;
    if (!Array.isArray(sponsorData)) throw new Error('sponsors.json does not contain a sponsor list.');
    const packageSponsors = sponsorData.map(parsePackageSponsor);
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
      // Store what the bytes actually are, not what the package's filename claims.
      const detectedExt = sniffImageExtension(data);
      if (!detectedExt) throw new Error(`The package contains an invalid image asset: ${sourceName}`);
      const targetName = `${randomId(12)}${detectedExt}`;
      fs.writeFileSync(path.join(PHOTOS_DIR, targetName), data, { flag: 'wx' });
      createdPhotos.push(targetName);
      photoMapping.set(sourceName, targetName);
    }

    const { nextSponsors, sponsorMapping } = mergePackageSponsors(originalSponsors, packageSponsors, photoMapping);

    importedChartId = uniqueChartId(chart.partnerName, new Set(readIndex().map((entry) => entry.id)));
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
