import type { Person, Position } from '../types';

export const MIN_NODE_WIDTH = 220;
export const NODE_HEIGHT = 110;
const NODE_GAP = 48;
const RANK_GAP = 80;
const BRANCH_GAP = 120;

interface PackedTree {
  positions: Map<string, Position>;
  width: number;
}

export function personNodeWidth(name: string): number {
  const nameWidth = Array.from(name.trim()).reduce((width, character) => {
    if (/\s/.test(character)) return width + 5;
    if (/[ilI1'.,]/.test(character)) return width + 5;
    if (/[MW@%&]/.test(character)) return width + 14;
    if (/[A-Z]/.test(character)) return width + 11;
    return width + 9;
  }, 0);
  return Math.max(MIN_NODE_WIDTH, 92 + nameWidth);
}

function packTree(person: Person, childrenByManager: Map<string, Person[]>, visited: Set<string>): PackedTree {
  visited.add(person.id);
  const nodeWidth = personNodeWidth(person.name);
  const children = (childrenByManager.get(person.id) ?? []).filter((child) => !visited.has(child.id));
  if (children.length === 0) {
    return { positions: new Map([[person.id, { x: 0, y: 0 }]]), width: nodeWidth };
  }

  const packedChildren = children.map((child) => packTree(child, childrenByManager, visited));
  const childrenWidth = packedChildren.reduce((sum, child) => sum + child.width, 0) + NODE_GAP * (children.length - 1);
  const width = Math.max(nodeWidth, childrenWidth);
  const childrenOffset = (width - childrenWidth) / 2;
  const positions = new Map<string, Position>([[person.id, { x: (width - nodeWidth) / 2, y: 0 }]]);
  let childX = childrenOffset;

  for (const child of packedChildren) {
    for (const [id, position] of child.positions) {
      positions.set(id, {
        x: position.x + childX,
        y: position.y + NODE_HEIGHT + RANK_GAP,
      });
    }
    childX += child.width + NODE_GAP;
  }

  return { positions, width };
}

/**
 * Computes a top-down tree layout from manager/subordinate relationships.
 * People with a saved `position` keep it unless `force` is true.
 */
export function computeAutoLayout(people: Person[], force = false): Map<string, Position> {
  const needsLayout = force ? people : people.filter((p) => !p.position);
  if (needsLayout.length === 0) return new Map();

  const ids = new Set(people.map((person) => person.id));
  const childrenByManager = new Map<string, Person[]>();
  for (const person of people) {
    if (!person.managerId || !ids.has(person.managerId)) continue;
    const children = childrenByManager.get(person.managerId) ?? [];
    children.push(person);
    childrenByManager.set(person.managerId, children);
  }
  for (const children of childrenByManager.values()) {
    children.sort((a, b) => a.name.localeCompare(b.name));
  }

  const roots = people.filter((person) => !person.managerId || !ids.has(person.managerId));
  const visited = new Set<string>();
  const packedRoots = roots.map((root) => packTree(root, childrenByManager, visited));
  for (const person of people) {
    if (!visited.has(person.id)) packedRoots.push(packTree(person, childrenByManager, visited));
  }

  const allPositions = new Map<string, Position>();
  let rootX = 0;
  for (const root of packedRoots) {
    for (const [id, position] of root.positions) {
      allPositions.set(id, { x: position.x + rootX, y: position.y });
    }
    rootX += root.width + BRANCH_GAP;
  }

  const idsToPlace = new Set(needsLayout.map((person) => person.id));
  return new Map([...allPositions].filter(([id]) => idsToPlace.has(id)));
}
