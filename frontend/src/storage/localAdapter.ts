/**
 * Local-folder storage: implements the full StorageAdapter in the browser against a user-picked
 * directory (File System Access API). The folder layout is identical to the server's DATA_DIR,
 * so the same folder works interchangeably in Docker/server mode, and an unzipped backup archive
 * is directly usable as a data folder. No data ever leaves the browser.
 */

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import {
  BACKUP_MANIFEST_FILE,
  MAX_EXPANDED_SIZE,
  MAX_HISTORY_SNAPSHOTS,
  MAX_PACKAGE_ARCHIVE_SIZE,
  MAX_PACKAGE_ENTRIES,
  MAX_PHOTO_SIZE,
  PACKAGE_CHART_FILE,
  PACKAGE_MANIFEST_FILE,
  PACKAGE_SPONSORS_FILE,
  SNAPSHOT_MIN_INTERVAL_MS,
  applyPersonPatch,
  applyPositions,
  applySponsorPatch,
  buildBackupManifest,
  buildPackageContents,
  buildPackageManifest,
  buildPerson,
  buildSponsor,
  isValidChartId,
  mappedPhoto,
  mergePackageSponsors,
  migrateStoredChart,
  migrateStoredSponsors,
  parsePackageChart,
  parsePackageManifest,
  parsePackageSponsor,
  randomId,
  removePersonWithReparent,
  sniffImageExtension,
  uniqueChartId,
  validatePackageEntryName,
  type StoredChart,
  type StoredSponsor,
} from '@orgchartr/shared';
import type { Chart, ChartHistoryEntry, ChartIndexEntry, Person, Sponsor, SponsorUsageEntry } from '../types';
import type { StorageAdapter, StorageCapabilities } from './adapter';
import {
  ensureDataDirs,
  fileExists,
  getDir,
  isNotFoundError,
  listFiles,
  readFileBytes,
  readJson,
  removeEntry,
  writeBytes,
  writeJson,
} from './fsaFs';

function assertChartId(id: string): void {
  if (!isValidChartId(id)) throw new Error('Invalid chart id');
}

export class LocalFolderAdapter implements StorageAdapter {
  readonly mode = 'local' as const;
  readonly capabilities: StorageCapabilities = { backupExport: true, backupRestore: false, packageZip: true };

  private root: FileSystemDirectoryHandle;
  /** Stored photo filename -> object URL, pre-resolved so photoUrl() can stay synchronous. */
  private photoUrls = new Map<string, string>();
  /** Serialises mutations within this tab; the Web Lock serialises across tabs. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(root: FileSystemDirectoryHandle) {
    this.root = root;
  }

  get folderName(): string {
    return this.root.name;
  }

  /** Scaffolds the data layout; call once right after the folder is picked/reopened. */
  async initialise(): Promise<void> {
    await ensureDataDirs(this.root);
  }

  /** Revokes cached object URLs; call when switching folders or tearing down. */
  dispose(): void {
    for (const url of this.photoUrls.values()) URL.revokeObjectURL(url);
    this.photoUrls.clear();
  }

  // ---- locking -------------------------------------------------------------

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = (): Promise<T> =>
      typeof navigator !== 'undefined' && navigator.locks
        ? navigator.locks.request('orgchartr:data', fn)
        : fn();
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  // ---- directory helpers ---------------------------------------------------

  private async chartsDir(): Promise<FileSystemDirectoryHandle> {
    const dir = await getDir(this.root, ['charts'], { create: true });
    if (!dir) throw new Error('Could not open the data folder.');
    return dir;
  }

  private async photosDir(): Promise<FileSystemDirectoryHandle> {
    const dir = await getDir(this.root, ['assets', 'photos'], { create: true });
    if (!dir) throw new Error('Could not open the data folder.');
    return dir;
  }

  private async requireFileBytes(dir: FileSystemDirectoryHandle, name: string): Promise<Uint8Array> {
    const data = await readFileBytes(dir, name);
    if (!data) throw new Error(`The data file disappeared while it was being read: ${name}`);
    return data;
  }

  private historyDir(id: string, create: boolean): Promise<FileSystemDirectoryHandle | null> {
    assertChartId(id);
    return getDir(this.root, ['charts', 'history', id], { create });
  }

  // ---- index / chart persistence (mirrors server dataStore) ----------------

  private async readIndex(): Promise<ChartIndexEntry[]> {
    return readJson<ChartIndexEntry[]>(await this.chartsDir(), 'index.json', []);
  }

  private async writeIndex(entries: ChartIndexEntry[]): Promise<void> {
    await writeJson(await this.chartsDir(), 'index.json', entries);
  }

  private async loadChart(id: string): Promise<Chart | null> {
    assertChartId(id);
    const charts = await this.chartsDir();
    if (!(await fileExists(charts, `${id}.json`))) return null;
    const stored = await readJson<StoredChart>(charts, `${id}.json`, { id, partnerName: id, people: [] });
    return migrateStoredChart(stored);
  }

  private async requireChart(id: string): Promise<Chart> {
    const chart = await this.loadChart(id);
    if (!chart) throw new Error('Chart not found');
    return chart;
  }

  private async listSnapshotEpochs(dir: FileSystemDirectoryHandle): Promise<number[]> {
    return (await listFiles(dir))
      .filter((name) => name.endsWith('.json'))
      .map((name) => Number(name.replace('.json', '')))
      .filter((epoch) => !Number.isNaN(epoch))
      .sort((a, b) => a - b);
  }

  /** Copies the chart's current on-disk content into its history folder (throttled), as on the server. */
  private async snapshotChartHistory(id: string, force = false): Promise<void> {
    const charts = await this.chartsDir();
    const current = await readFileBytes(charts, `${id}.json`);
    if (!current) return;
    const dir = await this.historyDir(id, true);
    if (!dir) return;
    const epochs = await this.listSnapshotEpochs(dir);
    const now = Date.now();
    const last = epochs[epochs.length - 1];
    if (!force && last && now - last < SNAPSHOT_MIN_INTERVAL_MS) return;
    await writeBytes(dir, `${now}.json`, current);
    const all = [...epochs, now];
    while (all.length > MAX_HISTORY_SNAPSHOTS) {
      const oldest = all.shift();
      await removeEntry(dir, `${oldest}.json`);
    }
  }

  /** Persists a chart and refreshes its index entry (person count, last-updated timestamp). */
  private async saveChart(chart: Chart): Promise<void> {
    assertChartId(chart.id);
    await this.snapshotChartHistory(chart.id);
    await writeJson(await this.chartsDir(), `${chart.id}.json`, chart);
    const index = await this.readIndex();
    const entry: ChartIndexEntry = {
      id: chart.id,
      partnerName: chart.partnerName,
      personCount: chart.people.length,
      lastUpdated: new Date().toISOString(),
    };
    const existingIdx = index.findIndex((e) => e.id === chart.id);
    if (existingIdx >= 0) index[existingIdx] = entry;
    else index.push(entry);
    await this.writeIndex(index);
  }

  private async loadSponsorList(): Promise<Sponsor[]> {
    return migrateStoredSponsors(await readJson<StoredSponsor[]>(this.root, 'sponsors.json', []));
  }

  private async saveSponsorList(sponsors: Sponsor[]): Promise<void> {
    await writeJson(this.root, 'sponsors.json', sponsors);
  }

  // ---- photos --------------------------------------------------------------

  /** Pre-resolves object URLs for stored photo filenames so photoUrl() can answer synchronously. */
  private async ensurePhotoUrls(filenames: Iterable<string | null>): Promise<void> {
    let photos: FileSystemDirectoryHandle | null = null;
    for (const name of filenames) {
      if (!name || this.photoUrls.has(name)) continue;
      photos ??= await getDir(this.root, ['assets', 'photos']);
      if (!photos) return;
      try {
        const file = await (await photos.getFileHandle(name)).getFile();
        this.photoUrls.set(name, URL.createObjectURL(file));
      } catch (error) {
        if (!isNotFoundError(error)) throw error;
        // Missing photo file; the UI falls back to the initials avatar.
      }
    }
  }

  private async writePhoto(data: Uint8Array): Promise<string> {
    const ext = sniffImageExtension(data);
    if (!ext) throw new Error('Unsupported file type. Use JPEG, PNG, WEBP, or GIF.');
    const filename = `${randomId(12)}${ext}`;
    await writeBytes(await this.photosDir(), filename, data);
    this.photoUrls.set(filename, URL.createObjectURL(new Blob([data as BlobPart])));
    return filename;
  }

  private async removePhoto(filename: string): Promise<void> {
    const photos = await getDir(this.root, ['assets', 'photos']);
    if (photos) await removeEntry(photos, filename);
    const url = this.photoUrls.get(filename);
    if (url) {
      URL.revokeObjectURL(url);
      this.photoUrls.delete(filename);
    }
  }

  /** Removes photo files no longer referenced by any chart's people or any sponsor. */
  private async garbageCollectPhotos(): Promise<void> {
    const used = new Set<string>();
    for (const entry of await this.readIndex()) {
      const chart = await this.loadChart(entry.id);
      if (!chart) continue;
      for (const person of chart.people) {
        if (person.photo) used.add(person.photo);
      }
    }
    for (const sponsor of await this.loadSponsorList()) {
      if (sponsor.photo) used.add(sponsor.photo);
    }
    const photos = await getDir(this.root, ['assets', 'photos']);
    if (!photos) return;
    for (const file of await listFiles(photos)) {
      if (!used.has(file)) await this.removePhoto(file);
    }
  }

  // ---- StorageAdapter: charts ----------------------------------------------

  async listCharts(): Promise<ChartIndexEntry[]> {
    return this.readIndex();
  }

  async getChart(id: string): Promise<Chart> {
    const chart = await this.requireChart(id);
    await this.ensurePhotoUrls(chart.people.map((person) => person.photo));
    return chart;
  }

  createChart(partnerName: string): Promise<Chart> {
    return this.withLock(async () => {
      if (!partnerName || !partnerName.trim()) throw new Error('partnerName is required');
      const existingIds = new Set((await this.readIndex()).map((e) => e.id));
      const id = uniqueChartId(partnerName, existingIds);
      const chart: Chart = { id, partnerName: partnerName.trim(), description: '', people: [] };
      await this.saveChart(chart);
      return chart;
    });
  }

  renameChart(id: string, partnerName: string): Promise<Chart> {
    return this.withLock(async () => {
      const chart = await this.requireChart(id);
      if (typeof partnerName === 'string' && partnerName.trim()) chart.partnerName = partnerName.trim();
      await this.saveChart(chart);
      return chart;
    });
  }

  updateChartDescription(id: string, description: string): Promise<Chart> {
    return this.withLock(async () => {
      const chart = await this.requireChart(id);
      if (typeof description === 'string') chart.description = description;
      await this.saveChart(chart);
      return chart;
    });
  }

  deleteChart(id: string): Promise<void> {
    return this.withLock(async () => {
      assertChartId(id);
      const charts = await this.chartsDir();
      const found = await removeEntry(charts, `${id}.json`);
      if (!found) throw new Error('Chart not found');
      const history = await getDir(this.root, ['charts', 'history']);
      if (history) await removeEntry(history, id, { recursive: true });
      await this.writeIndex((await this.readIndex()).filter((e) => e.id !== id));
      await this.garbageCollectPhotos();
    });
  }

  async listChartHistory(id: string): Promise<ChartHistoryEntry[]> {
    await this.requireChart(id);
    const dir = await this.historyDir(id, false);
    if (!dir) return [];
    const epochs = await this.listSnapshotEpochs(dir);
    const entries: ChartHistoryEntry[] = [];
    for (const epoch of epochs) {
      let personCount = 0;
      try {
        const data = await readJson<{ people?: unknown[] }>(dir, `${epoch}.json`, {});
        personCount = Array.isArray(data.people) ? data.people.length : 0;
      } catch {
        // Ignore an unreadable/corrupt snapshot file.
      }
      entries.push({ timestamp: new Date(epoch).toISOString(), personCount });
    }
    return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  restoreChartHistory(id: string, timestamp: string): Promise<Chart> {
    return this.withLock(async () => {
      await this.requireChart(id);
      const epoch = Date.parse(timestamp);
      const dir = await this.historyDir(id, false);
      const name = `${epoch}.json`;
      if (Number.isNaN(epoch) || !dir || !(await fileExists(dir, name))) {
        throw new Error('That snapshot no longer exists.');
      }
      // Snapshot the current state first (unthrottled) so the restore itself can be undone.
      await this.snapshotChartHistory(id, true);
      const snapshot = await readJson<StoredChart>(dir, name, { id, partnerName: id, people: [] });
      await this.saveChart(migrateStoredChart(snapshot));
      const restored = await this.requireChart(id);
      await this.ensurePhotoUrls(restored.people.map((person) => person.photo));
      return restored;
    });
  }

  // ---- StorageAdapter: people ----------------------------------------------

  addPerson(chartId: string, person: Partial<Person>): Promise<Person> {
    return this.withLock(async () => {
      const chart = await this.requireChart(chartId);
      const created = buildPerson(person as Record<string, unknown>, chart.people, new Date().toISOString());
      chart.people.push(created);
      await this.saveChart(chart);
      return created;
    });
  }

  updatePerson(chartId: string, personId: string, patch: Partial<Person>): Promise<Person> {
    return this.withLock(async () => {
      const chart = await this.requireChart(chartId);
      const person = chart.people.find((p) => p.id === personId);
      if (!person) throw new Error('Person not found');
      applyPersonPatch(chart, person, patch as Record<string, unknown>, new Date().toISOString());
      await this.saveChart(chart);
      return person;
    });
  }

  deletePerson(chartId: string, personId: string): Promise<void> {
    return this.withLock(async () => {
      const chart = await this.requireChart(chartId);
      const found = removePersonWithReparent(chart, personId, new Date().toISOString());
      if (!found) throw new Error('Person not found');
      await this.saveChart(chart);
      await this.garbageCollectPhotos();
    });
  }

  updatePositions(chartId: string, positions: Record<string, { x: number; y: number }>): Promise<Chart> {
    return this.withLock(async () => {
      const chart = await this.requireChart(chartId);
      applyPositions(chart, positions, new Date().toISOString());
      await this.saveChart(chart);
      return chart;
    });
  }

  // ---- StorageAdapter: sponsors --------------------------------------------

  async listSponsors(): Promise<Sponsor[]> {
    const sponsors = await this.loadSponsorList();
    await this.ensurePhotoUrls(sponsors.map((sponsor) => sponsor.photo));
    return sponsors;
  }

  async sponsorUsage(): Promise<Record<string, SponsorUsageEntry[]>> {
    const usage: Record<string, SponsorUsageEntry[]> = {};
    for (const entry of await this.readIndex()) {
      const chart = await this.loadChart(entry.id);
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

  addSponsor(sponsor: Partial<Sponsor>): Promise<Sponsor> {
    return this.withLock(async () => {
      const sponsors = await this.loadSponsorList();
      const created = buildSponsor(sponsor as Record<string, unknown>, new Date().toISOString());
      sponsors.push(created);
      await this.saveSponsorList(sponsors);
      return created;
    });
  }

  updateSponsor(id: string, patch: Partial<Sponsor>): Promise<Sponsor> {
    return this.withLock(async () => {
      const sponsors = await this.loadSponsorList();
      const sponsor = sponsors.find((s) => s.id === id);
      if (!sponsor) throw new Error('Sponsor not found');
      applySponsorPatch(sponsor, patch as Record<string, unknown>, new Date().toISOString());
      await this.saveSponsorList(sponsors);
      return sponsor;
    });
  }

  deleteSponsor(id: string): Promise<void> {
    return this.withLock(async () => {
      const sponsors = await this.loadSponsorList();
      const idx = sponsors.findIndex((s) => s.id === id);
      if (idx === -1) throw new Error('Sponsor not found');
      sponsors.splice(idx, 1);
      await this.saveSponsorList(sponsors);

      // Strip this sponsor from any person that referenced it, across every chart.
      for (const entry of await this.readIndex()) {
        const chart = await this.loadChart(entry.id);
        if (!chart) continue;
        let changed = false;
        for (const person of chart.people) {
          if (person.sponsorIds.includes(id)) {
            person.sponsorIds = person.sponsorIds.filter((sponsorId) => sponsorId !== id);
            person.updatedAt = new Date().toISOString();
            changed = true;
          }
        }
        if (changed) await this.saveChart(chart);
      }

      await this.garbageCollectPhotos();
    });
  }

  // ---- StorageAdapter: photos ----------------------------------------------

  uploadPhoto(file: File): Promise<{ filename: string }> {
    return this.withLock(async () => {
      if (file.size > MAX_PHOTO_SIZE) throw new Error('The photo is larger than the 5 MB limit.');
      const data = new Uint8Array(await file.arrayBuffer());
      const filename = await this.writePhoto(data);
      return { filename };
    });
  }

  photoUrl(filename: string | null): string | null {
    return filename ? this.photoUrls.get(filename) ?? null : null;
  }

  // ---- StorageAdapter: portable chart packages -----------------------------

  exportChartPackage(chartId: string, personIds: string[]): Promise<Blob> {
    return this.withLock(async () => {
      const chart = await this.requireChart(chartId);
      if (!Array.isArray(personIds) || personIds.length === 0 || personIds.some((id) => typeof id !== 'string')) {
        throw new Error('Select at least one person to export.');
      }
      const selectedIds = new Set<string>(personIds);
      if ([...selectedIds].some((id) => !chart.people.some((person) => person.id === id))) {
        throw new Error('The export selection contains a person outside this chart.');
      }

      const photosDir = await this.photosDir();
      const existing = new Set(await listFiles(photosDir));
      const { chart: packagedChart, sponsors, photos } = buildPackageContents(
        chart,
        selectedIds,
        await this.loadSponsorList(),
        (photo) => existing.has(photo),
      );

      const files: Record<string, Uint8Array> = {};
      files[PACKAGE_MANIFEST_FILE] = strToU8(`${JSON.stringify(buildPackageManifest(), null, 2)}\n`);
      files[PACKAGE_CHART_FILE] = strToU8(`${JSON.stringify(packagedChart, null, 2)}\n`);
      files[PACKAGE_SPONSORS_FILE] = strToU8(`${JSON.stringify(sponsors, null, 2)}\n`);
      for (const photo of photos) {
        files[`assets/photos/${photo}`] = await this.requireFileBytes(photosDir, photo);
      }
      return new Blob([zipSync(files) as BlobPart], { type: 'application/zip' });
    });
  }

  importChartPackage(file: File): Promise<Chart> {
    return this.withLock(async () => {
      if (file.size > MAX_PACKAGE_ARCHIVE_SIZE) {
        throw new Error('The chart package is larger than the 100 MB limit.');
      }
      let entries: Record<string, Uint8Array>;
      try {
        entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
      } catch {
        throw new Error('That file is not a valid chart package.');
      }

      const originalSponsors = await this.loadSponsorList();
      const createdPhotos: string[] = [];
      let importedChartId: string | null = null;
      let sponsorsSaved = false;
      try {
        const names = Object.keys(entries);
        if (names.length > MAX_PACKAGE_ENTRIES) throw new Error('The package contains too many files.');
        const seenPaths = new Set<string>();
        let expandedSize = 0;
        for (const name of names) {
          validatePackageEntryName(name, name.endsWith('/'));
          const canonicalPath = name.replace(/\/$/, '').toLocaleLowerCase();
          if (seenPaths.has(canonicalPath)) throw new Error(`Duplicate package path: ${name}`);
          seenPaths.add(canonicalPath);
          expandedSize += entries[name].length;
          if (!Number.isSafeInteger(expandedSize) || expandedSize > MAX_EXPANDED_SIZE) {
            throw new Error('The expanded package is too large.');
          }
        }
        if (![PACKAGE_MANIFEST_FILE, PACKAGE_CHART_FILE, PACKAGE_SPONSORS_FILE].every((name) => seenPaths.has(name))) {
          throw new Error('This file does not look like an orgchartr chart package.');
        }

        parsePackageManifest(JSON.parse(strFromU8(entries[PACKAGE_MANIFEST_FILE])));
        const chart = parsePackageChart(JSON.parse(strFromU8(entries[PACKAGE_CHART_FILE])));
        const sponsorData = JSON.parse(strFromU8(entries[PACKAGE_SPONSORS_FILE])) as unknown;
        if (!Array.isArray(sponsorData)) throw new Error('sponsors.json does not contain a sponsor list.');
        const packageSponsors = sponsorData.map(parsePackageSponsor);
        const packageSponsorIds = new Set(packageSponsors.map((sponsor) => sponsor.id));
        if (packageSponsorIds.size !== packageSponsors.length) throw new Error('The package contains duplicate sponsor IDs.');
        if (chart.people.some((person) => person.sponsorIds.some((id) => !packageSponsorIds.has(id)))) {
          throw new Error('The package contains a sponsor mapping without sponsor data.');
        }

        const referencedPhotos = new Set([
          ...chart.people.flatMap((person) => (person.photo ? [person.photo] : [])),
          ...packageSponsors.flatMap((sponsor) => (sponsor.photo ? [sponsor.photo] : [])),
        ]);
        const photoMapping = new Map<string, string>();
        for (const sourceName of referencedPhotos) {
          const data = entries[`assets/photos/${sourceName}`];
          if (!data) throw new Error(`The package is missing photo asset: ${sourceName}`);
          // Store what the bytes actually are, not what the package's filename claims.
          if (!sniffImageExtension(data)) throw new Error(`The package contains an invalid image asset: ${sourceName}`);
          const targetName = await this.writePhoto(data);
          createdPhotos.push(targetName);
          photoMapping.set(sourceName, targetName);
        }

        const { nextSponsors, sponsorMapping } = mergePackageSponsors(originalSponsors, packageSponsors, photoMapping);

        importedChartId = uniqueChartId(chart.partnerName, new Set((await this.readIndex()).map((e) => e.id)));
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
          ...importedChart.people.flatMap((person) => (person.photo ? [person.photo] : [])),
          ...nextSponsors.flatMap((sponsor) => (sponsor.photo ? [sponsor.photo] : [])),
        ]);
        for (const photo of createdPhotos.filter((name) => !retainedPhotos.has(name))) {
          await this.removePhoto(photo);
        }

        await this.saveSponsorList(nextSponsors);
        sponsorsSaved = true;
        await this.saveChart(importedChart);
        await this.ensurePhotoUrls(importedChart.people.map((person) => person.photo));
        return importedChart;
      } catch (error) {
        if (importedChartId) {
          try {
            const charts = await this.chartsDir();
            await removeEntry(charts, `${importedChartId}.json`);
          } catch {
            /* Best-effort rollback. */
          }
          try {
            await this.writeIndex((await this.readIndex()).filter((e) => e.id !== importedChartId));
          } catch {
            /* Best-effort rollback. */
          }
        }
        if (sponsorsSaved) {
          try {
            await this.saveSponsorList(originalSponsors);
          } catch {
            /* Best-effort rollback. */
          }
        }
        for (const photo of createdPhotos) {
          try {
            await this.removePhoto(photo);
          } catch {
            /* Best-effort rollback. */
          }
        }
        throw error instanceof Error ? error : new Error('The chart package could not be imported.');
      }
    });
  }

  // ---- StorageAdapter: backup ----------------------------------------------

  exportBackup(): Promise<Blob> {
    return this.withLock(async () => {
      const files: Record<string, Uint8Array> = {};
      files[BACKUP_MANIFEST_FILE] = strToU8(`${JSON.stringify(buildBackupManifest(), null, 2)}\n`);

      const charts = await this.chartsDir();
      const chartFiles = await listFiles(charts);
      if (!chartFiles.includes('index.json')) throw new Error('The data folder is missing charts/index.json.');
      for (const name of chartFiles) {
        files[`charts/${name}`] = await this.requireFileBytes(charts, name);
      }
      const history = await getDir(this.root, ['charts', 'history']);
      if (history) {
        for await (const [chartId, handle] of history.entries()) {
          if (handle.kind !== 'directory') continue;
          const dir = handle as FileSystemDirectoryHandle;
          for (const name of await listFiles(dir)) {
            files[`charts/history/${chartId}/${name}`] = await this.requireFileBytes(dir, name);
          }
        }
      }
      files['sponsors.json'] = await this.requireFileBytes(this.root, 'sponsors.json');
      const photos = await getDir(this.root, ['assets', 'photos']);
      if (photos) {
        for (const name of await listFiles(photos)) {
          files[`assets/photos/${name}`] = await this.requireFileBytes(photos, name);
        }
      }
      return new Blob([zipSync(files) as BlobPart], { type: 'application/zip' });
    });
  }

  restoreBackup(): Promise<void> {
    return Promise.reject(new Error(
      'Restore is not needed in local folder mode: unzip the backup and open that folder instead.',
    ));
  }
}
