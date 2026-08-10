import { create } from 'zustand';
import { clearActiveAdapter, setActiveAdapter } from './active';
import { LocalFolderAdapter } from './localAdapter';
import { clearDirectoryHandle, loadDirectoryHandle, saveDirectoryHandle } from './handleStore';
import { inspectDataFolder, markDataFolder } from './fsaFs';

export type StorageStatus =
  /** Deciding between server and local mode. */
  | 'probing'
  /** An adapter is active; the app can render. */
  | 'ready'
  /** Local mode, no remembered folder: show the "choose a folder" onboarding. */
  | 'local-picker'
  /** Local mode with a remembered folder that needs its permission re-granted (user gesture). */
  | 'local-reopen'
  /** Local mode in a browser without the File System Access API. */
  | 'unsupported';

interface StorageState {
  status: StorageStatus;
  mode: 'server' | 'local' | null;
  folderName: string | null;
  /** Name of the remembered folder awaiting permission re-grant. */
  rememberedFolderName: string | null;
  error: string | null;

  initialise: () => Promise<void>;
  /** Opens the directory picker; must be called from a user gesture (click). */
  pickFolder: () => Promise<void>;
  /** Re-requests permission on the remembered folder; must be called from a user gesture. */
  reopenFolder: () => Promise<void>;
  /** Forgets the remembered folder and returns to the picker screen. */
  forgetFolder: () => Promise<void>;
  /** Switches to a different folder from within the running app (user gesture). */
  switchFolder: () => Promise<void>;
  /** Clears the remembered handle and returns to the folder picker without deleting data. */
  lockFolder: () => Promise<void>;
}

function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

const STORAGE_MODE = import.meta.env.VITE_STORAGE_MODE as 'auto' | 'local';
const PROBE_TIMEOUT_MS = 1500;

/** True when the Express API answers, meaning the app is served by the self-hosted server. */
async function probeServer(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch('/api/health', { signal: controller.signal });
    // Static hosts (and `vite preview`) answer unknown paths with the SPA's index.html and a
    // 200, so a JSON content-type is what actually distinguishes the Express API.
    return res.ok && (res.headers.get('content-type') ?? '').includes('application/json');
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let activeLocalAdapter: LocalFolderAdapter | null = null;
let initialiseStarted = false;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export const useStorageStore = create<StorageState>((set, get) => {
  async function activateLocal(handle: FileSystemDirectoryHandle): Promise<void> {
    const folderKind = await inspectDataFolder(handle);
    if (folderKind === 'unrecognised') {
      throw new Error('Choose a dedicated empty folder or an existing orgchartr data folder. No files were changed.');
    }
    if (folderKind === 'legacy') {
      const confirmed = window.confirm(
        `"${handle.name}" looks like an existing orgchartr folder. Mark it as an orgchartr data folder and continue?`,
      );
      if (!confirmed) throw new DOMException('Folder migration cancelled.', 'AbortError');
    }
    if (folderKind === 'empty' || folderKind === 'legacy') await markDataFolder(handle);

    const adapter = new LocalFolderAdapter(handle);
    await adapter.initialise();
    await saveDirectoryHandle(handle);
    activeLocalAdapter?.dispose();
    activeLocalAdapter = adapter;
    setActiveAdapter(adapter);
    set({ status: 'ready', mode: 'local', folderName: handle.name, rememberedFolderName: null, error: null });
  }

  return {
    status: 'probing',
    mode: null,
    folderName: null,
    rememberedFolderName: null,
    error: null,

    initialise: async () => {
      if (initialiseStarted) return;
      initialiseStarted = true;

      if (STORAGE_MODE === 'auto' && (await probeServer())) {
        const { serverAdapter } = await import('./serverAdapter');
        setActiveAdapter(serverAdapter);
        set({ status: 'ready', mode: 'server', error: null });
        return;
      }

      if (!supportsFileSystemAccess()) {
        set({ status: 'unsupported' });
        return;
      }

      const remembered = await loadDirectoryHandle();
      if (!remembered) {
        set({ status: 'local-picker' });
        return;
      }
      try {
        if ((await remembered.queryPermission({ mode: 'readwrite' })) === 'granted') {
          await activateLocal(remembered);
          return;
        }
        set({ status: 'local-reopen', rememberedFolderName: remembered.name });
      } catch (error) {
        if (isAbortError(error)) {
          set({ status: 'local-reopen', rememberedFolderName: remembered.name, error: null });
          return;
        }
        await clearDirectoryHandle();
        set({
          status: 'local-picker',
          error: error instanceof Error ? error.message : 'Could not open the remembered folder.',
        });
      }
    },

    pickFolder: async () => {
      try {
        const handle = await window.showDirectoryPicker({ id: 'orgchartr-data', mode: 'readwrite' });
        await activateLocal(handle);
      } catch (err) {
        // AbortError: the user closed the picker; stay where we are.
        if (isAbortError(err)) return;
        set({
          status: 'local-picker',
          error: err instanceof Error ? err.message : 'Could not open that folder. Please try another one.',
        });
      }
    },

    reopenFolder: async () => {
      const remembered = await loadDirectoryHandle();
      if (!remembered) {
        set({ status: 'local-picker', rememberedFolderName: null });
        return;
      }
      try {
        if ((await remembered.requestPermission({ mode: 'readwrite' })) === 'granted') {
          await activateLocal(remembered);
          return;
        }
        set({ status: 'local-reopen', error: 'Permission was not granted. You can try again or choose a different folder.' });
      } catch (err) {
        set({
          status: 'local-reopen',
          error: err instanceof Error ? err.message : 'Could not reopen the folder.',
        });
      }
    },

    forgetFolder: async () => {
      await clearDirectoryHandle();
      set({ status: 'local-picker', rememberedFolderName: null, error: null });
    },

    switchFolder: async () => {
      if (get().mode !== 'local') return;
      try {
        const handle = await window.showDirectoryPicker({ id: 'orgchartr-data', mode: 'readwrite' });
        await activateLocal(handle);
        // Data under every route changed wholesale; reload so all stores re-fetch.
        window.location.reload();
      } catch (err) {
        if (isAbortError(err)) return;
        set({ error: err instanceof Error ? err.message : 'Could not open that folder.' });
      }
    },

    lockFolder: async () => {
      if (get().mode !== 'local') return;
      activeLocalAdapter?.dispose();
      activeLocalAdapter = null;
      clearActiveAdapter();
      await clearDirectoryHandle();
      window.location.reload();
    },
  };
});
