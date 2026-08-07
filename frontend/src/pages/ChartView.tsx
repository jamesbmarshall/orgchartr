import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnNodeDrag,
  type OnConnect,
} from '@xyflow/react';
import { Filter, History, Search, StickyNote, X } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import { useChartStore } from '../store/chartStore';
import { useSponsorStore } from '../store/sponsorStore';
import { computeAutoLayout } from '../layout/autoLayout';
import { PersonNode, type PersonNodeData } from '../components/PersonNode';
import { PersonModal } from '../components/PersonModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useUndoStore } from '../store/undoStore';
import { ExportModal } from '../components/ExportModal';
import { ImportModal } from '../components/ImportModal';
import { HistoryModal } from '../components/HistoryModal';
import type { Person } from '../types';
import { colorLegendEntries } from '../utils/personColors';
import { comparePeopleBySurname } from '../utils/personNames';
import { getDescendantIds } from '../utils/orgTree';

const nodeTypes = { person: PersonNode };

interface ChartViewState {
  search?: string;
  sponsorFilter?: string;
  managerFilter?: string;
  tagFilter?: string;
  showFilters?: boolean;
  collapsedIds?: string[];
}

function loadChartViewState(chartId: string | undefined): ChartViewState | null {
  if (!chartId) return null;
  try {
    const raw = localStorage.getItem(`orgchartr:chartView:${chartId}`);
    return raw ? (JSON.parse(raw) as ChartViewState) : null;
  } catch {
    return null;
  }
}

export function ChartView() {
  const { chartId } = useParams<{ chartId: string }>();
  const {
    activeChart,
    activeChartLoading,
    activeChartError,
    loadChart,
    clearActiveChart,
    renameChart,
    updateChartDescription,
    addPerson,
    updatePerson,
    deletePerson,
    updatePositions,
  } = useChartStore();
  const { sponsors, load: loadSponsors, addSponsor } = useSponsorStore();
  const { scheduleDelete } = useUndoStore();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<PersonNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [editingPerson, setEditingPerson] = useState<Person | 'new' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Person | null>(null);
  const [hiddenPersonIds, setHiddenPersonIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  // Search/filter/collapsed state is initialised from this chart's last saved view (if any).
  // Since navigating to a different chart always remounts this component (via the Dashboard route),
  // a lazy initial state is sufficient here and avoids restore/persist effects racing each other.
  const [showFilters, setShowFilters] = useState(() => loadChartViewState(chartId)?.showFilters ?? false);
  const [search, setSearch] = useState(() => loadChartViewState(chartId)?.search ?? '');
  const [sponsorFilter, setSponsorFilter] = useState(() => loadChartViewState(chartId)?.sponsorFilter ?? '');
  const [managerFilter, setManagerFilter] = useState(() => loadChartViewState(chartId)?.managerFilter ?? '');
  const [tagFilter, setTagFilter] = useState(() => loadChartViewState(chartId)?.tagFilter ?? '');
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    () => new Set(loadChartViewState(chartId)?.collapsedIds ?? []),
  );
  const [renameError, setRenameError] = useState<string | null>(null);
  const [confirmingResetLayout, setConfirmingResetLayout] = useState(false);
  const [resettingLayout, setResettingLayout] = useState(false);
  const [resetLayoutError, setResetLayoutError] = useState<string | null>(null);
  const [reparentError, setReparentError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // Bumped after a bulk "reset layout" to force the canvas to remount: replacing every node's
  // position at once can leave @xyflow/react's internal measurement state stuck (nodes rendered
  // with visibility:hidden forever). Remounting is the reliable way to recover from that.
  const [layoutVersion, setLayoutVersion] = useState(0);

  useEffect(() => {
    if (chartId) loadChart(chartId);
    loadSponsors();
    return () => clearActiveChart();
  }, [chartId, loadChart, clearActiveChart, loadSponsors]);

  // Persist this chart's search/filter/collapsed state as it changes.
  useEffect(() => {
    if (!chartId) return;
    const state = { search, sponsorFilter, managerFilter, tagFilter, showFilters, collapsedIds: [...collapsedIds] };
    try {
      localStorage.setItem(`orgchartr:chartView:${chartId}`, JSON.stringify(state));
    } catch {
      // Ignore storage failures (e.g. private browsing quota); state simply won't persist.
    }
  }, [chartId, search, sponsorFilter, managerFilter, tagFilter, showFilters, collapsedIds]);

  const sponsorById = useMemo(() => new Map(sponsors.map((s) => [s.id, s])), [sponsors]);

  const managerOptions = useMemo(
    () =>
      (activeChart?.people ?? [])
        .filter((person) => activeChart?.people.some((report) => report.managerId === person.id))
        .toSorted(comparePeopleBySurname),
    [activeChart],
  );
  const tagOptions = useMemo(
    () => [...new Set((activeChart?.people ?? []).flatMap((person) => person.tags))].toSorted((a, b) => a.localeCompare(b)),
    [activeChart],
  );
  const visiblePeople = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (activeChart?.people ?? []).filter(
      (person) =>
        !hiddenPersonIds.has(person.id) &&
        (!sponsorFilter || person.sponsorIds.includes(sponsorFilter)) &&
        (!managerFilter || person.managerId === managerFilter) &&
        (!tagFilter || person.tags.includes(tagFilter)) &&
        (!query ||
          person.name.toLowerCase().includes(query) ||
          person.title.toLowerCase().includes(query) ||
          person.department.toLowerCase().includes(query)),
    );
  }, [activeChart, managerFilter, search, sponsorFilter, tagFilter, hiddenPersonIds]);
  const hiddenDescendantIds = useMemo(() => {
    const hidden = new Set<string>();
    for (const personId of collapsedIds) {
      for (const descendantId of getDescendantIds(activeChart?.people ?? [], personId)) hidden.add(descendantId);
    }
    return hidden;
  }, [activeChart, collapsedIds]);
  const displayedPeople = useMemo(
    () => visiblePeople.filter((person) => !hiddenDescendantIds.has(person.id)),
    [hiddenDescendantIds, visiblePeople],
  );
  const filtersActive = Boolean(sponsorFilter || managerFilter || tagFilter);
  const activeFilterCount = [sponsorFilter, managerFilter, tagFilter].filter(Boolean).length;
  const searchActive = Boolean(search.trim());
  const anyFilterActive = filtersActive || searchActive;
  const legendEntries = useMemo(() => colorLegendEntries(displayedPeople), [displayedPeople]);

  const handleEdit = useCallback((person: Person) => setEditingPerson(person), []);
  const handleDelete = useCallback((person: Person) => setPendingDelete(person), []);
  const handleToggleCollapsed = useCallback((personId: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!activeChart) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const autoPositions = computeAutoLayout(activeChart.people, false);
    const visibleIds = new Set(displayedPeople.map((person) => person.id));
    const newNodes: Node<PersonNodeData>[] = displayedPeople.map((person) => ({
      id: person.id,
      type: 'person',
      position: person.position ?? autoPositions.get(person.id) ?? { x: 0, y: 0 },
      data: {
        person,
        sponsors: person.sponsorIds.flatMap((id) => {
          const sponsor = sponsorById.get(id);
          return sponsor ? [sponsor] : [];
        }),
        hasDirectReports: activeChart.people.some((report) => report.managerId === person.id),
        collapsed: collapsedIds.has(person.id),
        onToggleCollapsed: handleToggleCollapsed,
        onEdit: handleEdit,
        onDelete: handleDelete,
      },
    }));
    const newEdges: Edge[] = displayedPeople
      .filter((person) => person.managerId && visibleIds.has(person.managerId))
      .map((p) => ({ id: `${p.managerId}-${p.id}`, source: p.managerId as string, target: p.id }));
    setNodes(newNodes);
    setEdges(newEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChart, displayedPeople, sponsorById, collapsedIds, handleToggleCollapsed, handleEdit, handleDelete]);

  const onNodeDragStop: OnNodeDrag<Node<PersonNodeData>> = useCallback(
    (_event, node) => {
      setMoveError(null);
      updatePerson(node.id, { position: { x: node.position.x, y: node.position.y } }).catch((err) => {
        setMoveError(
          err instanceof Error ? err.message : 'Could not save the new position. It will revert when the chart reloads.',
        );
      });
    },
    [updatePerson],
  );

  // Dragging from a person's bottom (source) handle to another person's top (target) handle
  // sets the target person's manager to the source person. The server validates that this
  // doesn't create a cycle; edges are re-derived from activeChart once the update lands, so
  // there's no local edge state to reconcile on failure.
  const onConnect: OnConnect = useCallback(
    ({ source, target }) => {
      if (!source || !target || source === target) return;
      setReparentError(null);
      updatePerson(target, { managerId: source }).catch((err) => {
        setReparentError(err instanceof Error ? err.message : 'Could not update the reporting line. Please try again.');
      });
    },
    [updatePerson],
  );

  async function handleResetLayout() {
    if (!activeChart) return;
    setResettingLayout(true);
    setResetLayoutError(null);
    try {
      const positions = computeAutoLayout(activeChart.people, true);
      await updatePositions(Object.fromEntries(positions));
      setLayoutVersion((version) => version + 1);
    } catch (err) {
      setResetLayoutError(err instanceof Error ? err.message : 'Could not reset the layout. Please try again.');
    } finally {
      setResettingLayout(false);
    }
  }

  function startRename() {
    setNameDraft(activeChart?.partnerName ?? '');
    setRenameError(null);
    setRenaming(true);
  }

  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    if (!chartId || !nameDraft.trim()) return;
    setRenameError(null);
    try {
      await renameChart(chartId, nameDraft.trim());
      setRenaming(false);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Could not rename the chart. Please try again.');
    }
  }

  function startEditingNotes() {
    setNotesDraft(activeChart?.description ?? '');
    setNotesError(null);
    setEditingNotes(true);
  }

  async function submitNotes(e: React.FormEvent) {
    e.preventDefault();
    if (!chartId) return;
    setSavingNotes(true);
    setNotesError(null);
    try {
      await updateChartDescription(chartId, notesDraft.trim());
      setEditingNotes(false);
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : 'Could not save notes. Please try again.');
    } finally {
      setSavingNotes(false);
    }
  }

  if (activeChartLoading) return <div className="page">Loading chart…</div>;
  if (activeChartError) return <div className="page error-text">{activeChartError}</div>;
  if (!activeChart) return null;

  return (
    <div className="chart-view">
      <div className="chart-toolbar">
        <Link to="/">← Dashboard</Link>
        {renaming ? (
          <form onSubmit={submitRename} className="rename-form">
            <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} autoFocus />
            <button type="submit" className="primary">
              Save
            </button>
            <button type="button" onClick={() => setRenaming(false)}>
              Cancel
            </button>
            {renameError && <span className="error-text">{renameError}</span>}
          </form>
        ) : (
          <h1 onClick={startRename} title="Click to rename">
            {activeChart.partnerName}
          </h1>
        )}
        <div className="chart-toolbar__search">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search people…"
            aria-label="Search people by name, title, or department"
          />
        </div>
        <div className="chart-toolbar__actions">
          <button
            type="button"
            className={`chart-toolbar__icon-button${filtersActive ? ' chart-toolbar__icon-button--active' : ''}`}
            title={showFilters ? 'Hide filters' : 'Show filters'}
            aria-label={showFilters ? 'Hide chart filters' : 'Show chart filters'}
            aria-expanded={showFilters}
            aria-controls="chart-filters"
            onClick={() => setShowFilters((visible) => !visible)}
          >
            <Filter aria-hidden="true" />
            {activeFilterCount > 0 && <span className="chart-toolbar__filter-count">{activeFilterCount}</span>}
          </button>
          <button type="button" className="primary" onClick={() => setEditingPerson('new')}>
            Add person
          </button>
          <button type="button" onClick={() => setExporting(true)}>
            Export
          </button>
          <button type="button" onClick={() => setImporting(true)}>
            Import
          </button>
          <button type="button" onClick={() => setConfirmingResetLayout(true)} disabled={resettingLayout}>
            {resettingLayout ? 'Resetting…' : 'Reset layout'}
          </button>
          <button
            type="button"
            className={`chart-toolbar__icon-button${activeChart.description ? ' chart-toolbar__icon-button--active' : ''}`}
            title="Chart notes"
            aria-label="Chart notes"
            aria-expanded={editingNotes}
            onClick={() => (editingNotes ? setEditingNotes(false) : startEditingNotes())}
          >
            <StickyNote aria-hidden="true" />
          </button>
          <button
            type="button"
            className="chart-toolbar__icon-button"
            title="Version history"
            aria-label="View chart version history"
            onClick={() => setShowHistory(true)}
          >
            <History aria-hidden="true" />
          </button>
        </div>
      </div>
      {resetLayoutError && <p className="error-text">{resetLayoutError}</p>}
      {reparentError && <p className="error-text">{reparentError}</p>}
      {moveError && <p className="error-text">{moveError}</p>}

      {editingNotes ? (
        <form onSubmit={submitNotes} className="chart-notes chart-notes--editing">
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="Notes about this partner or chart…"
            rows={3}
            autoFocus
          />
          <div className="chart-notes__actions">
            <button type="submit" className="primary" disabled={savingNotes}>
              {savingNotes ? 'Saving…' : 'Save notes'}
            </button>
            <button type="button" onClick={() => setEditingNotes(false)} disabled={savingNotes}>
              Cancel
            </button>
          </div>
          {notesError && <p className="error-text">{notesError}</p>}
        </form>
      ) : (
        activeChart.description && (
          <div className="chart-notes" onClick={startEditingNotes} title="Click to edit notes">
            <StickyNote aria-hidden="true" />
            <p>{activeChart.description}</p>
          </div>
        )
      )}

      {showFilters && <div id="chart-filters" className="chart-filters" aria-label="Chart filters">
        <label>
          <span>Sponsor</span>
          <select value={sponsorFilter} onChange={(event) => setSponsorFilter(event.target.value)}>
            <option value="">All sponsors</option>
            {sponsors
              .toSorted((a, b) => a.name.localeCompare(b.name))
              .map((sponsor) => (
                <option key={sponsor.id} value={sponsor.id}>
                  {sponsor.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span>Manager</span>
          <select value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)}>
            <option value="">All managers</option>
            {managerOptions.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Tag</span>
          <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
            <option value="">All tags</option>
            {tagOptions.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
        <span className="chart-filters__count" aria-live="polite">
          {visiblePeople.length} of {activeChart.people.length} people
        </span>
        <button
          type="button"
          className="chart-filters__clear"
          disabled={!anyFilterActive}
          title="Clear filters"
          aria-label="Clear all filters"
          onClick={() => {
            setSponsorFilter('');
            setManagerFilter('');
            setTagFilter('');
            setSearch('');
          }}
        >
          <X aria-hidden="true" />
        </button>
      </div>}

      <div className="chart-canvas" key={layoutVersion}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          colorMode="dark"
          deleteKeyCode={null}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
        {legendEntries.length > 0 && (
          <aside className="chart-legend" aria-label="Colour coding legend">
            <strong>Colour key</strong>
            <div className="chart-legend__entries">
              {legendEntries.map((entry) => (
                <div key={`${entry.label}-${entry.edgeColor}-${entry.backgroundColor}`} className="chart-legend__entry">
                  <span
                    className="chart-legend__swatch"
                    style={{
                      backgroundColor: entry.backgroundColor ?? 'var(--surface)',
                      borderLeftColor: entry.edgeColor,
                    }}
                    aria-hidden="true"
                  />
                  <span>{entry.label}</span>
                </div>
              ))}
            </div>
          </aside>
        )}
        {activeChart.people.length === 0 && (
          <div className="chart-canvas__empty">
            <strong>This chart is empty</strong>
            <p>Add the first person to start mapping {activeChart.partnerName}'s organisation.</p>
            <button type="button" className="primary" onClick={() => setEditingPerson('new')}>
              Add your first person
            </button>
          </div>
        )}
        {activeChart.people.length > 0 && anyFilterActive && visiblePeople.length === 0 && (
          <div className="chart-canvas__empty">
            <strong>No people match these filters</strong>
            <button
              type="button"
              onClick={() => {
                setSponsorFilter('');
                setManagerFilter('');
                setTagFilter('');
                setSearch('');
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {exporting && (
        <ExportModal
          chartId={activeChart.id}
          partnerName={activeChart.partnerName}
          people={activeChart.people}
          sponsors={sponsors}
          onClose={() => setExporting(false)}
        />
      )}

      {importing && (
        <ImportModal
          people={activeChart.people}
          sponsors={sponsors}
          onAddPerson={addPerson}
          onUpdatePerson={updatePerson}
          onCreateSponsor={(name) => addSponsor({ name })}
          onClose={() => setImporting(false)}
        />
      )}

      {showHistory && chartId && (
        <HistoryModal
          chartId={chartId}
          onClose={() => setShowHistory(false)}
        />
      )}

      {editingPerson && (
        <PersonModal
          people={activeChart.people}
          sponsors={sponsors}
          person={editingPerson === 'new' ? undefined : editingPerson}
          onCreateSponsor={(name) => addSponsor({ name })}
          onSave={async (data) => {
            if (editingPerson === 'new') await addPerson(data);
            else await updatePerson(editingPerson.id, data);
            setEditingPerson(null);
          }}
          onClose={() => setEditingPerson(null)}
        />
      )}

      {confirmingResetLayout && (
        <ConfirmDialog
          title="Reset layout"
          message="Rearrange everyone into the automatic layout? This replaces any positions you've dragged people to by hand and can't be undone."
          confirmLabel="Reset layout"
          danger
          onConfirm={() => {
            setConfirmingResetLayout(false);
            handleResetLayout();
          }}
          onCancel={() => setConfirmingResetLayout(false)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Remove person"
          message={`Remove ${pendingDelete.name} from the chart? Their direct reports will be reparented to ${
            activeChart.people.find((p) => p.id === pendingDelete.managerId)?.name ?? 'the top of the chart'
          }. You'll have a few seconds to undo.`}
          confirmLabel="Remove"
          danger
          onConfirm={() => {
            const person = pendingDelete;
            setPendingDelete(null);
            setHiddenPersonIds((current) => new Set(current).add(person.id));
            scheduleDelete(
              `${person.name} removed from the chart.`,
              () => deletePerson(person.id),
              () =>
                setHiddenPersonIds((current) => {
                  const next = new Set(current);
                  next.delete(person.id);
                  return next;
                }),
            );
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
