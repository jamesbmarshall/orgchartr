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
} from '@xyflow/react';
import { Filter, X } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import { useChartStore } from '../store/chartStore';
import { useSponsorStore } from '../store/sponsorStore';
import { computeAutoLayout } from '../layout/autoLayout';
import { PersonNode, type PersonNodeData } from '../components/PersonNode';
import { PersonModal } from '../components/PersonModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExportModal } from '../components/ExportModal';
import type { Person } from '../types';
import { colorLegendEntries } from '../utils/personColors';
import { comparePeopleBySurname } from '../utils/personNames';
import { getDescendantIds } from '../utils/orgTree';

const nodeTypes = { person: PersonNode };

export function ChartView() {
  const { chartId } = useParams<{ chartId: string }>();
  const {
    activeChart,
    activeChartLoading,
    activeChartError,
    loadChart,
    clearActiveChart,
    renameChart,
    addPerson,
    updatePerson,
    deletePerson,
  } = useChartStore();
  const { sponsors, load: loadSponsors, addSponsor } = useSponsorStore();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<PersonNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [editingPerson, setEditingPerson] = useState<Person | 'new' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Person | null>(null);
  const [exporting, setExporting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sponsorFilter, setSponsorFilter] = useState('');
  const [managerFilter, setManagerFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (chartId) loadChart(chartId);
    loadSponsors();
    return () => clearActiveChart();
  }, [chartId, loadChart, clearActiveChart, loadSponsors]);

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
  const visiblePeople = useMemo(
    () =>
      (activeChart?.people ?? []).filter(
        (person) =>
          (!sponsorFilter || person.sponsorIds.includes(sponsorFilter)) &&
          (!managerFilter || person.managerId === managerFilter) &&
          (!tagFilter || person.tags.includes(tagFilter)),
      ),
    [activeChart, managerFilter, sponsorFilter, tagFilter],
  );
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
      updatePerson(node.id, { position: { x: node.position.x, y: node.position.y } });
    },
    [updatePerson],
  );

  async function handleResetLayout() {
    if (!activeChart) return;
    const positions = computeAutoLayout(activeChart.people, true);
    await Promise.all(
      activeChart.people.map((person) => {
        const pos = positions.get(person.id);
        return pos ? updatePerson(person.id, { position: pos }) : Promise.resolve();
      }),
    );
  }

  function startRename() {
    setNameDraft(activeChart?.partnerName ?? '');
    setRenaming(true);
  }

  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    if (chartId && nameDraft.trim()) await renameChart(chartId, nameDraft.trim());
    setRenaming(false);
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
          </form>
        ) : (
          <h1 onClick={startRename} title="Click to rename">
            {activeChart.partnerName}
          </h1>
        )}
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
          <button type="button" onClick={handleResetLayout}>
            Reset layout
          </button>
        </div>
      </div>

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
          disabled={!filtersActive}
          title="Clear filters"
          aria-label="Clear all filters"
          onClick={() => {
            setSponsorFilter('');
            setManagerFilter('');
            setTagFilter('');
          }}
        >
          <X aria-hidden="true" />
        </button>
      </div>}

      <div className="chart-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          colorMode="dark"
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
        {filtersActive && visiblePeople.length === 0 && (
          <div className="chart-canvas__empty">
            <strong>No people match these filters</strong>
            <button
              type="button"
              onClick={() => {
                setSponsorFilter('');
                setManagerFilter('');
                setTagFilter('');
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {exporting && (
        <ExportModal
          partnerName={activeChart.partnerName}
          people={activeChart.people}
          sponsors={sponsors}
          onClose={() => setExporting(false)}
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

      {pendingDelete && (
        <ConfirmDialog
          title="Remove person"
          message={`Remove ${pendingDelete.name} from the chart? Their direct reports will be reparented to ${
            activeChart.people.find((p) => p.id === pendingDelete.managerId)?.name ?? 'the top of the chart'
          }.`}
          confirmLabel="Remove"
          danger
          onConfirm={async () => {
            await deletePerson(pendingDelete.id);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
