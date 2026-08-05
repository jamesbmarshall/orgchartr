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
import '@xyflow/react/dist/style.css';
import { useChartStore } from '../store/chartStore';
import { useSponsorStore } from '../store/sponsorStore';
import { computeAutoLayout } from '../layout/autoLayout';
import { PersonNode, type PersonNodeData } from '../components/PersonNode';
import { PersonModal } from '../components/PersonModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExportModal } from '../components/ExportModal';
import type { Person } from '../types';

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

  useEffect(() => {
    if (chartId) loadChart(chartId);
    loadSponsors();
    return () => clearActiveChart();
  }, [chartId, loadChart, clearActiveChart, loadSponsors]);

  const sponsorById = useMemo(() => new Map(sponsors.map((s) => [s.id, s])), [sponsors]);

  const handleEdit = useCallback((person: Person) => setEditingPerson(person), []);
  const handleDelete = useCallback((person: Person) => setPendingDelete(person), []);

  useEffect(() => {
    if (!activeChart) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const autoPositions = computeAutoLayout(activeChart.people, false);
    const newNodes: Node<PersonNodeData>[] = activeChart.people.map((person) => ({
      id: person.id,
      type: 'person',
      position: person.position ?? autoPositions.get(person.id) ?? { x: 0, y: 0 },
      data: { person, sponsor: person.sponsorId ? sponsorById.get(person.sponsorId) : undefined, onEdit: handleEdit, onDelete: handleDelete },
    }));
    const newEdges: Edge[] = activeChart.people
      .filter((p) => p.managerId)
      .map((p) => ({ id: `${p.managerId}-${p.id}`, source: p.managerId as string, target: p.id }));
    setNodes(newNodes);
    setEdges(newEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChart, sponsorById, handleEdit, handleDelete]);

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
