import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { HardDrive } from 'lucide-react';
import { useChartStore } from '../store/chartStore';
import { useUndoStore } from '../store/undoStore';
import { useStorageStore } from '../storage/storageStore';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { api } from '../api/client';

export function Dashboard() {
  const { index, indexLoading, indexError, loadIndex, createChart, deleteChart } = useChartStore();
  const { scheduleDelete } = useUndoStore();
  const switchFolder = useStorageStore((state) => state.switchFolder);
  const lockFolder = useStorageStore((state) => state.lockFolder);
  const isLocalMode = api.mode === 'local';
  const navigate = useNavigate();
  const [newPartnerName, setNewPartnerName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const [importingPackage, setImportingPackage] = useState(false);
  const [packageError, setPackageError] = useState<string | null>(null);
  const packageInputRef = useRef<HTMLInputElement>(null);
  const [exportingBackup, setExportingBackup] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadIndex();
  }, [loadIndex]);

  const filteredIndex = useMemo(() => {
    const query = search.trim().toLowerCase();
    return index
      .filter((entry) => !hiddenIds.has(entry.id))
      .filter((entry) => !query || entry.partnerName.toLowerCase().includes(query));
  }, [index, search, hiddenIds]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newPartnerName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const chart = await createChart(newPartnerName.trim());
      setNewPartnerName('');
      navigate(`/chart/${chart.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create the chart. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  function handleConfirmDelete() {
    const id = pendingDelete;
    if (!id) return;
    const name = index.find((entry) => entry.id === id)?.partnerName ?? 'Chart';
    setPendingDelete(null);
    setHiddenIds((current) => new Set(current).add(id));
    scheduleDelete(
      `"${name}" deleted.`,
      () => deleteChart(id),
      () =>
        setHiddenIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        }),
    );
  }

  async function handleImportPackage(file: File) {
    setImportingPackage(true);
    setPackageError(null);
    try {
      const chart = await api.importChartPackage(file);
      navigate(`/chart/${chart.id}`);
    } catch (err) {
      setPackageError(err instanceof Error ? err.message : 'Could not import that chart package.');
    } finally {
      setImportingPackage(false);
    }
  }

  async function handleExportBackup() {
    setExportingBackup(true);
    setBackupError(null);
    try {
      const blob = await api.exportBackup();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `orgchartr-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Could not create a backup. Please try again.');
    } finally {
      setExportingBackup(false);
    }
  }

  async function handleConfirmRestore() {
    if (!restoreFile) return;
    setRestoring(true);
    setBackupError(null);
    try {
      await api.restoreBackup(restoreFile);
      setRestoreFile(null);
      // The restore replaces all charts, people, sponsors, and photos wholesale;
      // reload the whole app so every store re-fetches from the new data.
      window.location.reload();
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Restore failed. Please try again.');
      setRestoring(false);
    }
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Org charts</h1>
        <div className="page__header-actions">
          {isLocalMode && (
            <span className="storage-mode" title="Your data is stored in this folder on your computer.">
              <HardDrive size={14} aria-hidden />
              {api.folderName}
              <button type="button" onClick={() => void switchFolder()}>
                Switch folder…
              </button>
              <button type="button" onClick={() => void lockFolder()}>
                Lock and forget
              </button>
            </span>
          )}
          <Link to="/sponsors" className="button-link">
            Manage sponsors
          </Link>
        </div>
      </div>

      <form className="new-chart-form" onSubmit={handleCreate}>
        <input
          value={newPartnerName}
          onChange={(e) => setNewPartnerName(e.target.value)}
          placeholder="Partner name (e.g. Acme Corp)"
        />
        <button type="submit" className="primary" disabled={creating}>
          {creating ? 'Creating…' : 'New chart'}
        </button>
      </form>
      {createError && <p className="error-text">{createError}</p>}

      {index.length > 0 && (
        <input
          type="search"
          className="search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search charts by partner name…"
          aria-label="Search charts by partner name"
        />
      )}

      {indexLoading && <p>Loading…</p>}
      {indexError && <p className="error-text">{indexError}</p>}

      <div className="chart-grid">
        {filteredIndex.map((entry) => (
          <div key={entry.id} className="chart-card">
            <Link to={`/chart/${entry.id}`} className="chart-card__link">
              <h2>{entry.partnerName}</h2>
              <p>
                {entry.personCount} {entry.personCount === 1 ? 'person' : 'people'}
              </p>
              <p className="chart-card__updated">Updated {new Date(entry.lastUpdated).toLocaleString()}</p>
            </Link>
            <button type="button" className="danger" onClick={() => setPendingDelete(entry.id)}>
              Delete
            </button>
          </div>
        ))}
        {!indexLoading && index.length === 0 && <p>No org charts yet - create one above to get started.</p>}
        {!indexLoading && filteredIndex.length === 0 && index.length > 0 && search && (
          <p>No charts match "{search}".</p>
        )}
      </div>

      <div className="backup-section">
        <span className="backup-section__label">Chart packages</span>
        <button type="button" onClick={() => packageInputRef.current?.click()} disabled={importingPackage}>
          {importingPackage ? 'Importing…' : 'Import chart package…'}
        </button>
        <input
          ref={packageInputRef}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImportPackage(file);
            e.target.value = '';
          }}
        />
      </div>
      {packageError && <p className="error-text">{packageError}</p>}

      <div className="backup-section">
        <span className="backup-section__label">Full data backup &amp; restore</span>
        <button type="button" onClick={handleExportBackup} disabled={exportingBackup}>
          {exportingBackup ? 'Preparing…' : 'Export backup'}
        </button>
        {api.capabilities.backupRestore ? (
          <>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={restoring}>
              Restore from backup…
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setRestoreFile(file);
                e.target.value = '';
              }}
            />
          </>
        ) : (
          <span className="storage-mode">
            Your folder is your backup - copy it any time, or unzip a backup and open that folder.
          </span>
        )}
      </div>
      {backupError && <p className="error-text">{backupError}</p>}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete chart"
          message={`Delete "${
            index.find((entry) => entry.id === pendingDelete)?.partnerName ?? 'this chart'
          }" and all its people? You'll have a few seconds to undo.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {restoreFile && (
        <ConfirmDialog
          title="Restore from backup"
          message={`This will permanently replace ALL current charts, people, history, sponsors, and photos with the contents of "${restoreFile.name}". This cannot be undone. Continue?`}
          confirmLabel={restoring ? 'Restoring…' : 'Restore'}
          danger
          onConfirm={handleConfirmRestore}
          onCancel={() => setRestoreFile(null)}
        />
      )}
    </div>
  );
}

