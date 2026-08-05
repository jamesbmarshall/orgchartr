import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useSponsorStore } from '../store/sponsorStore';
import { useUndoStore } from '../store/undoStore';
import { SponsorModal } from '../components/SponsorModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { photoUrl } from '../api/client';
import type { Sponsor } from '../types';

export function Sponsors() {
  const { sponsors, loading, error, usage, load, loadUsage, addSponsor, updateSponsor, deleteSponsor } = useSponsorStore();
  const { scheduleDelete } = useUndoStore();
  const [editing, setEditing] = useState<Sponsor | 'new' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Sponsor | null>(null);
  const [search, setSearch] = useState('');
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    load();
    loadUsage();
  }, [load, loadUsage]);

  const filteredSponsors = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sponsors
      .filter((sponsor) => !hiddenIds.has(sponsor.id))
      .filter(
        (sponsor) =>
          !query ||
          sponsor.name.toLowerCase().includes(query) ||
          sponsor.title.toLowerCase().includes(query) ||
          sponsor.department.toLowerCase().includes(query),
      );
  }, [sponsors, search, hiddenIds]);

  function handleConfirmDelete() {
    const sponsor = pendingDelete;
    if (!sponsor) return;
    setPendingDelete(null);
    setHiddenIds((current) => new Set(current).add(sponsor.id));
    scheduleDelete(
      `${sponsor.name} removed from sponsors.`,
      () => deleteSponsor(sponsor.id),
      () =>
        setHiddenIds((current) => {
          const next = new Set(current);
          next.delete(sponsor.id);
          return next;
        }),
    );
  }

  function deleteMessage(sponsor: Sponsor): string {
    const entries = usage[sponsor.id] ?? [];
    if (entries.length === 0) {
      return `Remove ${sponsor.name} from the sponsor directory? You'll have a few seconds to undo.`;
    }
    const chartNames = [...new Set(entries.map((e) => e.chartName))];
    const peopleLabel = entries.length === 1 ? '1 person' : `${entries.length} people`;
    const chartLabel = chartNames.length === 1 ? chartNames[0] : `${chartNames.length} charts`;
    return `Remove ${sponsor.name} from the sponsor directory? They're currently linked to ${peopleLabel} on ${chartLabel} - that link will be removed. You'll have a few seconds to undo.`;
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Microsoft sponsors</h1>
        <Link to="/">Back to org charts</Link>
      </div>
      <p className="page__subtitle">
        Shared directory of Microsoft employees you can link as sponsors on any partner org chart.
      </p>

      <button type="button" className="primary" onClick={() => setEditing('new')}>
        Add sponsor
      </button>

      {sponsors.length > 0 && (
        <input
          type="search"
          className="search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sponsors by name, title, or department…"
          aria-label="Search sponsors"
        />
      )}

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}

      <div className="chart-grid">
        {filteredSponsors.map((sponsor) => {
          const photo = photoUrl(sponsor.photo);
          const usageCount = (usage[sponsor.id] ?? []).length;
          return (
            <div key={sponsor.id} className="sponsor-card">
              {photo && <img src={photo} alt={sponsor.name} className="sponsor-card__photo" />}
              <h2>{sponsor.name}</h2>
              <p>{sponsor.title}</p>
              <p className="chart-card__updated">{sponsor.department}</p>
              <p className="sponsor-card__usage">
                {usageCount > 0 ? `Used by ${usageCount} ${usageCount === 1 ? 'person' : 'people'}` : 'Not currently used'}
              </p>
              {sponsor.tags.length > 0 && (
                <div className="person-node__tags">
                  {sponsor.tags.map((tag) => (
                    <span key={tag} className="tag-chip">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="modal__actions">
                <button type="button" onClick={() => setEditing(sponsor)}>
                  Edit
                </button>
                <button type="button" className="danger" onClick={() => setPendingDelete(sponsor)}>
                  Delete
                </button>
              </div>
            </div>
          );
        })}
        {!loading && sponsors.length === 0 && <p>No sponsors yet - add one above.</p>}
        {!loading && filteredSponsors.length === 0 && sponsors.length > 0 && search && (
          <p>No sponsors match "{search}".</p>
        )}
      </div>

      {editing && (
        <SponsorModal
          sponsor={editing === 'new' ? undefined : editing}
          onSave={async (data) => {
            if (editing === 'new') await addSponsor(data);
            else await updateSponsor(editing.id, data);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete sponsor"
          message={deleteMessage(pendingDelete)}
          confirmLabel="Delete"
          danger
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
