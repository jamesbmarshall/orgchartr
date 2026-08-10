import { useEffect } from 'react';
import { FolderOpen, HardDrive } from 'lucide-react';
import { useStorageStore } from '../storage/storageStore';

/**
 * Decides how the app stores data before the main UI mounts: server mode when the Express API
 * answers (Docker/dev — no new screens), otherwise local-folder mode where the user picks a
 * directory that the browser reads and writes directly. Nothing renders until an adapter is active.
 */
export function StorageGate({ children }: { children: React.ReactNode }) {
  const { status, error, rememberedFolderName, initialise, pickFolder, reopenFolder, forgetFolder } = useStorageStore();

  useEffect(() => {
    void initialise();
  }, [initialise]);

  if (status === 'ready') return <>{children}</>;

  if (status === 'probing') {
    return (
      <div className="storage-gate">
        <p className="storage-gate__muted">Loading…</p>
      </div>
    );
  }

  if (status === 'unsupported') {
    return (
      <div className="storage-gate">
        <div className="storage-gate__panel">
          <h1>Browser not supported</h1>
          <p>
            orgchartr keeps your data in a folder on your computer, and this browser can't open
            local folders. Please use a Chromium-based browser such as <strong>Chrome</strong> or{' '}
            <strong>Edge</strong>.
          </p>
          <p className="storage-gate__muted">
            Your data never leaves your machine: the app reads and writes the folder directly from
            the browser and nothing is uploaded to a server.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'local-reopen') {
    return (
      <div className="storage-gate">
        <div className="storage-gate__panel">
          <HardDrive size={32} aria-hidden />
          <h1>Welcome back</h1>
          <p>
            Continue with your data folder
            {rememberedFolderName ? <strong> "{rememberedFolderName}"</strong> : null}? The browser
            will ask you to confirm access.
          </p>
          {error && <p className="error-text">{error}</p>}
          <div className="storage-gate__actions">
            <button type="button" className="primary" onClick={() => void reopenFolder()}>
              Reopen folder
            </button>
            <button type="button" onClick={() => void forgetFolder()}>
              Choose a different folder…
            </button>
          </div>
        </div>
      </div>
    );
  }

  // status === 'local-picker'
  return (
    <div className="storage-gate">
      <div className="storage-gate__panel">
        <FolderOpen size={32} aria-hidden />
        <h1>Choose your data folder</h1>
        <p>
          orgchartr stores everything - charts, people, sponsors, and photos - as plain files in a
          folder you pick on this computer. Pick an empty folder to start fresh, or an existing
          orgchartr data folder (or unzipped backup) to continue where you left off.
        </p>
        <p className="storage-gate__muted">
          Your data never leaves your machine: this page reads and writes the folder directly from
          the browser and nothing is uploaded to a server.
        </p>
        {error && <p className="error-text">{error}</p>}
        <div className="storage-gate__actions">
          <button type="button" className="primary" onClick={() => void pickFolder()}>
            Choose folder…
          </button>
        </div>
      </div>
    </div>
  );
}
