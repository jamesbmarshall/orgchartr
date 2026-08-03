import dagre from 'dagre';
import type { Person, Position } from '../types';

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 110;

/**
 * Computes a top-down tree layout from manager/subordinate relationships.
 * People with a saved `position` keep it unless `force` is true.
 */
export function computeAutoLayout(people: Person[], force = false): Map<string, Position> {
  const positions = new Map<string, Position>();

  const needsLayout = force ? people : people.filter((p) => !p.position);
  if (needsLayout.length === 0) return positions;

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));

  const idsInGraph = new Set(force ? people.map((p) => p.id) : people.map((p) => p.id));

  for (const person of people) {
    g.setNode(person.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const person of people) {
    if (person.managerId && idsInGraph.has(person.managerId)) {
      g.setEdge(person.managerId, person.id);
    }
  }

  dagre.layout(g);

  const nodesToPlace = force ? people : needsLayout;
  for (const person of nodesToPlace) {
    const node = g.node(person.id);
    if (node) positions.set(person.id, { x: node.x, y: node.y });
  }

  return positions;
}
