import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useSponsorStore } from '../store/sponsorStore';
import { SponsorModal } from '../components/SponsorModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { photoUrl } from '../api/client';
import type { Sponsor } from '../types';

export function Sponsors() {
  const { sponsors, loading, error, load, addSponsor, updateSponsor, deleteSponsor } = useSponsorStore();
  const [editing, setEditing] = useState<Sponsor | 'new' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Sponsor | null>(null);

  useEffect(() => {
    load();
  }, [load]);

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

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}

      <div className="chart-grid">
        {sponsors.map((sponsor) => {
          const photo = photoUrl(sponsor.photo);
          return (
            <div key={sponsor.id} className="sponsor-card">
              {photo && <img src={photo} alt={sponsor.name} className="sponsor-card__photo" />}
              <h2>{sponsor.name}</h2>
              <p>{sponsor.title}</p>
              <p className="chart-card__updated">{sponsor.department}</p>
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
          message={`Remove ${pendingDelete.name} from the sponsor directory? Any people currently linked to this sponsor will lose that link.`}
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await deleteSponsor(pendingDelete.id);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
