import { create } from 'zustand';
import { api } from '../api/client';
import type { Chart, ChartIndexEntry, Person } from '../types';

interface ChartStoreState {
  index: ChartIndexEntry[];
  indexLoading: boolean;
  indexError: string | null;

  activeChart: Chart | null;
  activeChartLoading: boolean;
  activeChartError: string | null;

  loadIndex: () => Promise<void>;
  createChart: (partnerName: string) => Promise<Chart>;
  renameChart: (id: string, partnerName: string) => Promise<void>;
  deleteChart: (id: string) => Promise<void>;

  loadChart: (id: string) => Promise<void>;
  clearActiveChart: () => void;
  addPerson: (data: Partial<Person>) => Promise<Person>;
  updatePerson: (personId: string, patch: Partial<Person>) => Promise<void>;
  deletePerson: (personId: string) => Promise<void>;
}

export const useChartStore = create<ChartStoreState>((set, get) => ({
  index: [],
  indexLoading: false,
  indexError: null,

  activeChart: null,
  activeChartLoading: false,
  activeChartError: null,

  loadIndex: async () => {
    set({ indexLoading: true, indexError: null });
    try {
      const index = await api.listCharts();
      set({ index, indexLoading: false });
    } catch (err) {
      set({ indexError: (err as Error).message, indexLoading: false });
    }
  },

  createChart: async (partnerName: string) => {
    const chart = await api.createChart(partnerName);
    await get().loadIndex();
    return chart;
  },

  renameChart: async (id: string, partnerName: string) => {
    await api.renameChart(id, partnerName);
    await get().loadIndex();
    const active = get().activeChart;
    if (active?.id === id) set({ activeChart: { ...active, partnerName } });
  },

  deleteChart: async (id: string) => {
    await api.deleteChart(id);
    await get().loadIndex();
  },

  loadChart: async (id: string) => {
    set({ activeChartLoading: true, activeChartError: null });
    try {
      const chart = await api.getChart(id);
      set({ activeChart: chart, activeChartLoading: false });
    } catch (err) {
      set({ activeChartError: (err as Error).message, activeChartLoading: false });
    }
  },

  clearActiveChart: () => set({ activeChart: null }),

  addPerson: async (data: Partial<Person>) => {
    const active = get().activeChart;
    if (!active) throw new Error('No active chart loaded');
    const person = await api.addPerson(active.id, data);
    set({ activeChart: { ...active, people: [...active.people, person] } });
    return person;
  },

  updatePerson: async (personId: string, patch: Partial<Person>) => {
    const active = get().activeChart;
    if (!active) throw new Error('No active chart loaded');
    const updated = await api.updatePerson(active.id, personId, patch);
    set({
      activeChart: {
        ...active,
        people: active.people.map((p) => (p.id === personId ? updated : p)),
      },
    });
  },

  deletePerson: async (personId: string) => {
    const active = get().activeChart;
    if (!active) throw new Error('No active chart loaded');
    await api.deletePerson(active.id, personId);
    // Reload from server since deleting can reparent other people's managerId.
    await get().loadChart(active.id);
  },
}));
