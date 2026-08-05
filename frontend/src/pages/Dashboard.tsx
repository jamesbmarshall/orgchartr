import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useChartStore } from '../store/chartStore';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function Dashboard() {
  const { index, indexLoading, indexError, loadIndex, createChart, deleteChart } = useChartStore();
  const navigate = useNavigate();
  const [newPartnerName, setNewPartnerName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    loadIndex();
  }, [loadIndex]);

  const filteredIndex = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return index;
    return index.filter((entry) => entry.partnerName.toLowerCase().includes(query));
  }, [index, search]);

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
        {!indexLoading && index.length > 0 && filteredIndex.length === 0 && <p>No charts match "{search}".</p>}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete chart"
          message={`Permanently delete "${
            index.find((entry) => entry.id === pendingDelete)?.partnerName ?? 'this chart'
          }" and all its people? This cannot be undone unless your storage provider has a recoverable backup.`}
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
