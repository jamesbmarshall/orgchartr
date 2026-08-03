import { create } from 'zustand';
import { api } from '../api/client';
import type { GitStatus } from '../types';

interface GitStoreState {
  status: GitStatus | null;
  loading: boolean;
  error: string | null;
  lastResult: string | null;
  refresh: () => Promise<void>;
  commit: (message: string) => Promise<boolean>;
  push: () => Promise<boolean>;
}

export const useGitStore = create<GitStoreState>((set, get) => ({
  status: null,
  loading: false,
  error: null,
  lastResult: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const status = await api.gitStatus();
      set({ status, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  commit: async (message: string) => {
    set({ loading: true, error: null });
    try {
      const result = await api.gitCommit(message);
      set({ lastResult: result.output, loading: false });
      await get().refresh();
      return result.committed;
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
      return false;
    }
  },

  push: async () => {
    set({ loading: true, error: null });
    try {
      const result = await api.gitPush();
      set({ lastResult: result.output, loading: false });
      return result.pushed;
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
      return false;
    }
  },
}));
