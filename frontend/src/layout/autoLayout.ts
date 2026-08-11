import type { Person, Position } from '../types';

export const MIN_NODE_WIDTH = 220;
export const NODE_HEIGHT = 110;
const NODE_GAP = 48;
const RANK_GAP = 80;
const BRANCH_GAP = 120;
export const M1_MAX_COLUMNS = 3;

interface PackedTree {
  positions: Map<string, Position>;
  width: number;
}

export interface M1GridCell {
  column: number;
  row: number;
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

export function getM1GridCells(people: Person[]): Map<string, M1GridCell> {
  const ids = new Set(people.map((person) => person.id));
  const childrenByManager = new Map<string, Person[]>();
  for (const person of people) {
    if (!person.managerId || !ids.has(person.managerId)) continue;
    const children = childrenByManager.get(person.managerId) ?? [];
    children.push(person);
    childrenByManager.set(person.managerId, children);
  }

  const cells = new Map<string, M1GridCell>();
  for (const children of childrenByManager.values()) {
    if (
      children.length <= M1_MAX_COLUMNS ||
      children.some((child) => (childrenByManager.get(child.id) ?? []).length > 0)
    ) {
      continue;
    }
    children.sort((a, b) => a.name.localeCompare(b.name));
    children.forEach((child, index) => {
      cells.set(child.id, {
        column: index % M1_MAX_COLUMNS,
        row: Math.floor(index / M1_MAX_COLUMNS),
      });
    });
  }
  return cells;
}

export function reportingEdgePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  targetWidth: number,
  row: number,
): string {
  const sourceBusY = sourceY + RANK_GAP / 2;
  if (row === 0) {
    return `M ${sourceX} ${sourceY} V ${sourceBusY} H ${targetX} V ${targetY}`;
  }

  const laneX = targetX - targetWidth / 2 - NODE_GAP / 2;
  const targetBusY = targetY - RANK_GAP / 2;
  return `M ${sourceX} ${sourceY} V ${sourceBusY} H ${laneX} V ${targetBusY} H ${targetX} V ${targetY}`;
}

function packTree(person: Person, childrenByManager: Map<string, Person[]>, visited: Set<string>): PackedTree {
  visited.add(person.id);
  const nodeWidth = personNodeWidth(person.name);
  const children = (childrenByManager.get(person.id) ?? []).filter((child) => !visited.has(child.id));
  if (children.length === 0) {
    return { positions: new Map([[person.id, { x: 0, y: 0 }]]), width: nodeWidth };
  }

  const isM1 = children.every((child) => (childrenByManager.get(child.id) ?? []).length === 0);
  if (isM1 && children.length > M1_MAX_COLUMNS) {
    const columnCount = Math.min(M1_MAX_COLUMNS, children.length);
    const columnWidths = Array.from({ length: columnCount }, (_, column) =>
      Math.max(...children.filter((_, index) => index % columnCount === column).map((child) => personNodeWidth(child.name))),
    );
    const gridWidth = columnWidths.reduce((sum, width) => sum + width, 0) + NODE_GAP * (columnCount - 1);
    const width = Math.max(nodeWidth, gridWidth);
    const gridOffset = (width - gridWidth) / 2;
    const columnOffsets: number[] = [];
    let columnX = gridOffset;
    for (const columnWidth of columnWidths) {
      columnOffsets.push(columnX);
      columnX += columnWidth + NODE_GAP;
    }

    const positions = new Map<string, Position>([[person.id, { x: (width - nodeWidth) / 2, y: 0 }]]);
    children.forEach((child, index) => {
      const column = index % columnCount;
      const row = Math.floor(index / columnCount);
      const childWidth = personNodeWidth(child.name);
      positions.set(child.id, {
        x: columnOffsets[column] + (columnWidths[column] - childWidth) / 2,
        y: (row + 1) * (NODE_HEIGHT + RANK_GAP),
      });
      visited.add(child.id);
    });
    return { positions, width };
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
