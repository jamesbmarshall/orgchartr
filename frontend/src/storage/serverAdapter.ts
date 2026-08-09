import type { Chart, ChartHistoryEntry, ChartIndexEntry, Person, Sponsor, SponsorUsageEntry } from '../types';
import type { StorageAdapter } from './adapter';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore parse errors */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Talks to the Express API; used when the app is served by the self-hosted server (Docker/dev). */
export const serverAdapter: StorageAdapter = {
  mode: 'server',
  capabilities: { backupExport: true, backupRestore: true, packageZip: true },

  // Charts
  listCharts: () => request<ChartIndexEntry[]>('/api/charts'),
  getChart: (id: string) => request<Chart>(`/api/charts/${id}`),
  createChart: (partnerName: string) =>
    request<Chart>('/api/charts', { method: 'POST', body: JSON.stringify({ partnerName }) }),
  renameChart: (id: string, partnerName: string) =>
    request<Chart>(`/api/charts/${id}`, { method: 'PATCH', body: JSON.stringify({ partnerName }) }),
  updateChartDescription: (id: string, description: string) =>
    request<Chart>(`/api/charts/${id}`, { method: 'PATCH', body: JSON.stringify({ description }) }),
  deleteChart: (id: string) => request<void>(`/api/charts/${id}`, { method: 'DELETE' }),
  listChartHistory: (id: string) => request<ChartHistoryEntry[]>(`/api/charts/${id}/history`),
  restoreChartHistory: (id: string, timestamp: string) =>
    request<Chart>(`/api/charts/${id}/history/restore`, { method: 'POST', body: JSON.stringify({ timestamp }) }),

  // Portable chart packages
  exportChartPackage: async (chartId: string, personIds: string[]): Promise<Blob> => {
    const res = await fetch(`/api/packages/export/${chartId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personIds }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? 'Could not create the chart package.');
    }
    return res.blob();
  },
  importChartPackage: async (file: File): Promise<Chart> => {
    const form = new FormData();
    form.append('package', file);
    const res = await fetch('/api/packages/import', { method: 'POST', body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? 'Could not import the chart package.');
    }
    return res.json();
  },

  // People
  addPerson: (chartId: string, person: Partial<Person>) =>
    request<Person>(`/api/charts/${chartId}/people`, { method: 'POST', body: JSON.stringify(person) }),
  updatePerson: (chartId: string, personId: string, patch: Partial<Person>) =>
    request<Person>(`/api/charts/${chartId}/people/${personId}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
  deletePerson: (chartId: string, personId: string) =>
    request<void>(`/api/charts/${chartId}/people/${personId}`, { method: 'DELETE' }),
  updatePositions: (chartId: string, positions: Record<string, { x: number; y: number }>) =>
    request<Chart>(`/api/charts/${chartId}/positions`, {
      method: 'PATCH',
      body: JSON.stringify({ positions }),
    }),

  // Sponsors
  listSponsors: () => request<Sponsor[]>('/api/sponsors'),
  sponsorUsage: () => request<Record<string, SponsorUsageEntry[]>>('/api/sponsors/usage'),
  addSponsor: (sponsor: Partial<Sponsor>) =>
    request<Sponsor>('/api/sponsors', { method: 'POST', body: JSON.stringify(sponsor) }),
  updateSponsor: (id: string, patch: Partial<Sponsor>) =>
    request<Sponsor>(`/api/sponsors/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteSponsor: (id: string) => request<void>(`/api/sponsors/${id}`, { method: 'DELETE' }),

  // Photos
  uploadPhoto: async (file: File): Promise<{ filename: string }> => {
    const form = new FormData();
    form.append('photo', file);
    const res = await fetch('/api/photos', { method: 'POST', body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? 'Photo upload failed');
    }
    return res.json();
  },
  photoUrl: (filename: string | null) => (filename ? `/photos/${filename}` : null),

  // Backup / restore
  exportBackup: async (): Promise<Blob> => {
    const res = await fetch('/api/backup');
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? 'Could not create a backup.');
    }
    return res.blob();
  },
  restoreBackup: async (file: File): Promise<void> => {
    const form = new FormData();
    form.append('backup', file);
    const res = await fetch('/api/backup/restore', { method: 'POST', body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? 'Restore failed.');
    }
  },
};
