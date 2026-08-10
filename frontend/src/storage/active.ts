import type { Chart, ChartHistoryEntry, ChartIndexEntry, Person, Sponsor, SponsorUsageEntry } from '../types';
import type { StorageAdapter, StorageCapabilities } from './adapter';

// The active adapter is chosen by the StorageGate before the main UI mounts, so every call
// below happens strictly after setActiveAdapter().
let active: StorageAdapter | null = null;

export function setActiveAdapter(adapter: StorageAdapter): void {
  active = adapter;
}

export function getActiveAdapter(): StorageAdapter {
  if (!active) throw new Error('Storage has not been initialised yet.');
  return active;
}

/** Facade with the same shape as the old HTTP `api` object; delegates to the active adapter. */
export const api = {
  get mode(): 'server' | 'local' {
    return getActiveAdapter().mode;
  },
  get capabilities(): StorageCapabilities {
    return getActiveAdapter().capabilities;
  },
  get folderName(): string | undefined {
    return getActiveAdapter().folderName;
  },

  // Charts
  listCharts: (): Promise<ChartIndexEntry[]> => getActiveAdapter().listCharts(),
  getChart: (id: string): Promise<Chart> => getActiveAdapter().getChart(id),
  createChart: (partnerName: string): Promise<Chart> => getActiveAdapter().createChart(partnerName),
  renameChart: (id: string, partnerName: string): Promise<Chart> => getActiveAdapter().renameChart(id, partnerName),
  updateChartDescription: (id: string, description: string): Promise<Chart> =>
    getActiveAdapter().updateChartDescription(id, description),
  deleteChart: (id: string): Promise<void> => getActiveAdapter().deleteChart(id),
  listChartHistory: (id: string): Promise<ChartHistoryEntry[]> => getActiveAdapter().listChartHistory(id),
  restoreChartHistory: (id: string, timestamp: string): Promise<Chart> =>
    getActiveAdapter().restoreChartHistory(id, timestamp),

  // Portable chart packages
  exportChartPackage: (chartId: string, personIds: string[]): Promise<Blob> =>
    getActiveAdapter().exportChartPackage(chartId, personIds),
  importChartPackage: (file: File): Promise<Chart> => getActiveAdapter().importChartPackage(file),

  // People
  addPerson: (chartId: string, person: Partial<Person>): Promise<Person> =>
    getActiveAdapter().addPerson(chartId, person),
  updatePerson: (chartId: string, personId: string, patch: Partial<Person>): Promise<Person> =>
    getActiveAdapter().updatePerson(chartId, personId, patch),
  deletePerson: (chartId: string, personId: string): Promise<void> =>
    getActiveAdapter().deletePerson(chartId, personId),
  updatePositions: (chartId: string, positions: Record<string, { x: number; y: number }>): Promise<Chart> =>
    getActiveAdapter().updatePositions(chartId, positions),

  // Sponsors
  listSponsors: (): Promise<Sponsor[]> => getActiveAdapter().listSponsors(),
  sponsorUsage: (): Promise<Record<string, SponsorUsageEntry[]>> => getActiveAdapter().sponsorUsage(),
  addSponsor: (sponsor: Partial<Sponsor>): Promise<Sponsor> => getActiveAdapter().addSponsor(sponsor),
  updateSponsor: (id: string, patch: Partial<Sponsor>): Promise<Sponsor> =>
    getActiveAdapter().updateSponsor(id, patch),
  deleteSponsor: (id: string): Promise<void> => getActiveAdapter().deleteSponsor(id),

  // Photos
  uploadPhoto: (file: File): Promise<{ filename: string }> => getActiveAdapter().uploadPhoto(file),

  // Backup / restore
  exportBackup: (): Promise<Blob> => getActiveAdapter().exportBackup(),
  restoreBackup: (file: File): Promise<void> => getActiveAdapter().restoreBackup(file),
};

export function photoUrl(filename: string | null): string | null {
  return getActiveAdapter().photoUrl(filename);
}
