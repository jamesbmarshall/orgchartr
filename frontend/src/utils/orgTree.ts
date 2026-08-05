import type { Person } from '../types';

/** Returns the set of ids that are descendants (subordinates, sub-subordinates, ...) of `personId`. */
export function getDescendantIds(people: Person[], personId: string): Set<string> {
  const descendants = new Set<string>();
  const stack = [personId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const p of people) {
      if (p.managerId === current && !descendants.has(p.id)) {
        descendants.add(p.id);
        stack.push(p.id);
      }
    }
  }
  return descendants;
}

/** Returns the ids on the path from `personId` up to its root manager (excluding `personId`). */
export function getAncestorIds(people: Person[], personId: string): string[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const ancestors: string[] = [];
  const seen = new Set<string>([personId]);
  let current = byId.get(personId)?.managerId ?? null;
  while (current && !seen.has(current)) {
    seen.add(current);
    ancestors.push(current);
    current = byId.get(current)?.managerId ?? null;
  }
  return ancestors;
}

export interface SubsetOptions {
  /** Include everyone reporting (directly or indirectly) into each selected person. */
  includeDescendants: boolean;
  /** Include each selected person's management chain, so the branch stays connected to the top. */
  includeAncestors: boolean;
}

/**
 * Builds an export-ready subset of `people` from the selected ids.
 * Manager links that point outside the subset are cleared so the result is a valid forest.
 */
export function buildSubset(people: Person[], selectedIds: Iterable<string>, options: SubsetOptions): Person[] {
  const included = new Set<string>();
  for (const id of selectedIds) {
    if (!people.some((p) => p.id === id)) continue;
    included.add(id);
    if (options.includeDescendants) {
      for (const descendantId of getDescendantIds(people, id)) included.add(descendantId);
    }
    if (options.includeAncestors) {
      for (const ancestorId of getAncestorIds(people, id)) included.add(ancestorId);
    }
  }
  return people
    .filter((p) => included.has(p.id))
    .map((p) => (p.managerId && included.has(p.managerId) ? p : { ...p, managerId: null }));
}
