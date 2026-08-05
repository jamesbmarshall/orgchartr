import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useChartStore } from '../store/chartStore';
import { ConfirmDialog } from './ConfirmDialog';
import type { ChartHistoryEntry } from '../types';

interface HistoryModalProps {
  chartId: string;
  onClose: () => void;
}

/** Lets the user browse and roll back to automatically-saved point-in-time snapshots of a chart.
 * Snapshots are taken server-side (throttled to at most once every few minutes) whenever the
 * chart changes, so this acts as a lightweight safety net alongside full backup/restore. */
export function HistoryModal({ chartId, onClose }: HistoryModalProps) {
  const restoreFromHistory = useChartStore((state) => state.restoreFromHistory);
  const [entries, setEntries] = useState<ChartHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<ChartHistoryEntry | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listChartHistory(chartId)
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load version history.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chartId]);

  async function handleConfirmRestore() {
    if (!pendingRestore) return;
    await restoreFromHistory(pendingRestore.timestamp);
    setPendingRestore(null);
    setRestored(true);
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <div className="modal">
        <h2 id="history-title">Version history</h2>
        <p className="export-hint">
          Snapshots are saved automatically as the chart changes (at most one every few minutes). Restoring rolls
          the chart back to that point in time; the current state is snapshotted first so you can undo a restore too.
        </p>

        {loading && <p>Loading…</p>}
        {loadError && <p className="error-text">{loadError}</p>}
        {restored && <p className="history-list__restored">Chart restored. Close this dialog to see the result.</p>}

        {!loading && !loadError && entries.length === 0 && (
          <p>No snapshots yet - one will be saved automatically the next time this chart changes.</p>
        )}

        {entries.length > 0 && (
          <ul className="history-list">
            {entries.map((entry) => (
              <li key={entry.timestamp} className="history-list__row">
                <div>
                  <div className="history-list__date">{new Date(entry.timestamp).toLocaleString()}</div>
                  <div className="history-list__meta">
                    {entry.personCount} {entry.personCount === 1 ? 'person' : 'people'}
                  </div>
                </div>
                <button type="button" onClick={() => setPendingRestore(entry)}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="modal__actions">
          <button type="button" className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {pendingRestore && (
        <ConfirmDialog
          title="Restore this snapshot?"
          message={`This will replace the chart's current people and layout with how it looked on ${new Date(
            pendingRestore.timestamp,
          ).toLocaleString()}. The current state is saved as a new snapshot first, so this can be undone from here too.`}
          confirmLabel="Restore"
          danger
          onConfirm={handleConfirmRestore}
          onCancel={() => setPendingRestore(null)}
        />
      )}
    </div>
  );
}
