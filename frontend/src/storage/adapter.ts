import type { Chart, ChartHistoryEntry, ChartIndexEntry, Person, Sponsor, SponsorUsageEntry } from '../types';

/** Which optional features the active storage mode supports; the UI hides what isn't available. */
export interface StorageCapabilities {
  /** Whole-install backup ZIP download. */
  backupExport: boolean;
  /** Destructive whole-install restore from a backup ZIP. */
  backupRestore: boolean;
  /** Portable single-chart package export/import. */
  packageZip: boolean;
}

/**
 * Everything the UI can do with user data. Server mode implements this over HTTP against the
 * Express API; local-folder mode implements it in the browser against a user-picked directory
 * (File System Access API) using the exact same on-disk layout as the server's DATA_DIR.
 */
export interface StorageAdapter {
  readonly mode: 'server' | 'local';
  readonly capabilities: StorageCapabilities;
  /** Name of the picked local folder (local mode only). */
  readonly folderName?: string;

  // Charts
  listCharts(): Promise<ChartIndexEntry[]>;
  getChart(id: string): Promise<Chart>;
  createChart(partnerName: string): Promise<Chart>;
  renameChart(id: string, partnerName: string): Promise<Chart>;
  updateChartDescription(id: string, description: string): Promise<Chart>;
  deleteChart(id: string): Promise<void>;
  listChartHistory(id: string): Promise<ChartHistoryEntry[]>;
  restoreChartHistory(id: string, timestamp: string): Promise<Chart>;

  // Portable chart packages
  exportChartPackage(chartId: string, personIds: string[]): Promise<Blob>;
  importChartPackage(file: File): Promise<Chart>;

  // People
  addPerson(chartId: string, person: Partial<Person>): Promise<Person>;
  updatePerson(chartId: string, personId: string, patch: Partial<Person>): Promise<Person>;
  deletePerson(chartId: string, personId: string): Promise<void>;
  updatePositions(chartId: string, positions: Record<string, { x: number; y: number }>): Promise<Chart>;

  // Sponsors
  listSponsors(): Promise<Sponsor[]>;
  sponsorUsage(): Promise<Record<string, SponsorUsageEntry[]>>;
  addSponsor(sponsor: Partial<Sponsor>): Promise<Sponsor>;
  updateSponsor(id: string, patch: Partial<Sponsor>): Promise<Sponsor>;
  deleteSponsor(id: string): Promise<void>;

  // Photos
  uploadPhoto(file: File): Promise<{ filename: string }>;
  /** Resolves a stored photo filename to a URL usable in <img src>. Sync: called during render. */
  photoUrl(filename: string | null): string | null;

  // Backup / restore
  exportBackup(): Promise<Blob>;
  restoreBackup(file: File): Promise<void>;
}
