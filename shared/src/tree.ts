import type { Chart, Person } from './types';

/** Returns true if `candidateId` is `personId` itself or a descendant of it (would create a cycle). */
export function isSelfOrDescendant(people: Person[], personId: string, candidateId: string): boolean {
  if (personId === candidateId) return true;
  const children = people.filter((p) => p.managerId === personId);
  return children.some((c) => isSelfOrDescendant(people, c.id, candidateId));
}

/**
 * Removes a person from the chart in place, reparenting their direct subordinates to the deleted
 * person's manager (or making them roots). Returns false if the person doesn't exist.
 */
export function removePersonWithReparent(chart: Chart, personId: string, now: string): boolean {
  const person = chart.people.find((p) => p.id === personId);
  if (!person) return false;
  chart.people.forEach((p) => {
    if (p.managerId === person.id) {
      p.managerId = person.managerId;
      p.updatedAt = now;
    }
  });
  chart.people = chart.people.filter((p) => p.id !== person.id);
  return true;
}
