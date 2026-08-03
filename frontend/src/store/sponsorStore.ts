import { create } from 'zustand';
import { api } from '../api/client';
import type { Sponsor } from '../types';

interface SponsorStoreState {
  sponsors: Sponsor[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  addSponsor: (data: Partial<Sponsor>) => Promise<Sponsor>;
  updateSponsor: (id: string, patch: Partial<Sponsor>) => Promise<void>;
  deleteSponsor: (id: string) => Promise<void>;
}

export const useSponsorStore = create<SponsorStoreState>((set, get) => ({
  sponsors: [],
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const sponsors = await api.listSponsors();
      set({ sponsors, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  addSponsor: async (data: Partial<Sponsor>) => {
    const sponsor = await api.addSponsor(data);
    set({ sponsors: [...get().sponsors, sponsor] });
    return sponsor;
  },

  updateSponsor: async (id: string, patch: Partial<Sponsor>) => {
    const updated = await api.updateSponsor(id, patch);
    set({ sponsors: get().sponsors.map((s) => (s.id === id ? updated : s)) });
  },

  deleteSponsor: async (id: string) => {
    await api.deleteSponsor(id);
    set({ sponsors: get().sponsors.filter((s) => s.id !== id) });
  },
}));
