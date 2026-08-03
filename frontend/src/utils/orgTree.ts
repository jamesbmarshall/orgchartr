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
