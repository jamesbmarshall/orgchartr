import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useChartStore } from '../store/chartStore';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function Dashboard() {
  const { index, indexLoading, indexError, loadIndex, createChart, deleteChart } = useChartStore();
  const [newPartnerName, setNewPartnerName] = useState('');
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    loadIndex();
  }, [loadIndex]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newPartnerName.trim()) return;
    setCreating(true);
    try {
      await createChart(newPartnerName.trim());
      setNewPartnerName('');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Org charts</h1>
        <Link to="/sponsors" className="button-link">
          Manage Microsoft sponsors
        </Link>
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

      {indexLoading && <p>Loading…</p>}
      {indexError && <p className="error-text">{indexError}</p>}

      <div className="chart-grid">
        {index.map((entry) => (
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
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete chart"
          message="This permanently deletes the chart and all its people. This cannot be undone unless your storage provider has a recoverable backup."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await deleteChart(pendingDelete);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
