import { useEffect, useState } from 'react';
import { useGitStore } from '../store/gitStore';

export function GitPanel() {
  const { status, loading, error, refresh, commit, push } = useGitStore();
  const [committing, setCommitting] = useState(false);
  const [confirmPush, setConfirmPush] = useState(false);
  const [pushing, setPushing] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCommit() {
    const message = window.prompt('Commit message', 'Update org chart data');
    if (!message) return;
    setCommitting(true);
    await commit(message);
    setCommitting(false);
  }

  async function handlePush() {
    setPushing(true);
    await push();
    setPushing(false);
    setConfirmPush(false);
  }

  const dirty = status && !status.clean;

  return (
    <div className="git-panel">
      <span className={`git-panel__status ${dirty ? 'git-panel__status--dirty' : 'git-panel__status--clean'}`}>
        {loading ? 'Checking…' : dirty ? `${status?.files.length} uncommitted change(s)` : 'All changes committed'}
      </span>
      <button type="button" onClick={handleCommit} disabled={committing || !dirty}>
        {committing ? 'Committing…' : 'Commit changes'}
      </button>
      {!confirmPush ? (
        <button type="button" onClick={() => setConfirmPush(true)}>
          Push…
        </button>
      ) : (
        <span className="git-panel__push-confirm">
          Push commits to the remote?
          <button type="button" className="primary" onClick={handlePush} disabled={pushing}>
            {pushing ? 'Pushing…' : 'Yes, push'}
          </button>
          <button type="button" onClick={() => setConfirmPush(false)}>
            Cancel
          </button>
        </span>
      )}
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
