import type { Chart, Person, Sponsor } from './types';
import { randomId } from './ids';
import { isStoredPhotoName } from './images';
import { isSelfOrDescendant } from './tree';
import {
  ValidationError,
  requireNonEmptyString,
  requirePosition,
  requireString,
  requireStringArray,
} from './validation';

/** Bound stored free-text notes so a bad client can't bloat chart files. */
export const MAX_NOTES_LENGTH = 4000;

/** null (photo cleared) or a safe stored photo filename; anything else is rejected. */
export function parsePhotoField(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (!isStoredPhotoName(value)) throw new ValidationError('photo must be a valid uploaded photo reference');
  return value;
}

export function parseColorField(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

export function parseNotesField(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_NOTES_LENGTH) : '';
}

/**
 * Builds a new Person from an untrusted input record, validating each field.
 * Throws ValidationError on any bad field (including an unknown managerId).
 */
export function buildPerson(input: Record<string, unknown>, people: Person[], now: string): Person {
  const { name, title, department, photo, managerId, sponsorIds, tags, edgeColor, backgroundColor, colorLabel, notes } = input;
  const parsedManagerId = managerId === null || managerId === undefined
    ? null
    : requireNonEmptyString(managerId, 'managerId');
  if (parsedManagerId && !people.some((p) => p.id === parsedManagerId)) {
    throw new ValidationError('managerId does not exist in this chart');
  }
  return {
    id: randomId(10),
    name: requireNonEmptyString(name, 'name'),
    title: title === undefined ? '' : requireString(title, 'title'),
    department: department === undefined ? '' : requireString(department, 'department'),
    photo: parsePhotoField(photo),
    managerId: parsedManagerId,
    sponsorIds: sponsorIds === undefined ? [] : requireStringArray(sponsorIds, 'sponsorIds'),
    tags: tags === undefined ? [] : requireStringArray(tags, 'tags'),
    edgeColor: parseColorField(edgeColor),
    backgroundColor: parseColorField(backgroundColor),
    colorLabel: typeof colorLabel === 'string' ? colorLabel.trim() : '',
    notes: parseNotesField(notes),
    position: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Applies a partial update to a person in place, validating fields and manager/cycle rules.
 * Throws ValidationError on any bad field.
 */
export function applyPersonPatch(chart: Chart, person: Person, patch: Record<string, unknown>, now: string): void {
  const { name, title, department, photo, managerId, sponsorIds, tags, edgeColor, backgroundColor, colorLabel, notes, position } = patch;

  if (managerId !== undefined) {
    if (managerId !== null) {
      if (!chart.people.some((p) => p.id === managerId)) {
        throw new ValidationError('managerId does not exist in this chart');
      }
      if (typeof managerId !== 'string' || isSelfOrDescendant(chart.people, person.id, managerId)) {
        throw new ValidationError('Cannot set manager to self or a descendant (would create a cycle)');
      }
    }
    person.managerId = managerId;
  }
  if (name !== undefined) person.name = requireNonEmptyString(name, 'name');
  if (title !== undefined) person.title = requireString(title, 'title');
  if (department !== undefined) person.department = requireString(department, 'department');
  if (photo !== undefined) person.photo = parsePhotoField(photo);
  if (sponsorIds !== undefined) person.sponsorIds = requireStringArray(sponsorIds, 'sponsorIds');
  if (tags !== undefined) person.tags = requireStringArray(tags, 'tags');
  if (colorLabel !== undefined) person.colorLabel = requireString(colorLabel, 'colorLabel').trim();
  if (notes !== undefined) person.notes = parseNotesField(notes);
  if (position !== undefined) person.position = requirePosition(position);
  if (edgeColor !== undefined) person.edgeColor = parseColorField(edgeColor);
  if (backgroundColor !== undefined) person.backgroundColor = parseColorField(backgroundColor);
  person.updatedAt = now;
}

/** Batch-applies saved canvas positions to matching people; silently skips malformed entries. */
export function applyPositions(chart: Chart, positions: Record<string, unknown>, now: string): void {
  for (const person of chart.people) {
    const pos = positions[person.id];
    if (
      pos &&
      typeof pos === 'object' &&
      typeof (pos as { x?: unknown }).x === 'number' &&
      typeof (pos as { y?: unknown }).y === 'number'
    ) {
      person.position = { x: (pos as { x: number }).x, y: (pos as { y: number }).y };
      person.updatedAt = now;
    }
  }
}

/** Builds a new Sponsor from an untrusted input record. Throws ValidationError on bad fields. */
export function buildSponsor(input: Record<string, unknown>, now: string): Sponsor {
  const { name, title, department, photo, tags } = input;
  return {
    id: randomId(10),
    name: requireNonEmptyString(name, 'name'),
    title: title === undefined ? '' : requireString(title, 'title'),
    department: department === undefined ? '' : requireString(department, 'department'),
    photo: parsePhotoField(photo),
    tags: tags === undefined ? [] : requireStringArray(tags, 'tags'),
    createdAt: now,
    updatedAt: now,
  };
}

/** Applies a partial update to a sponsor in place. Throws ValidationError on bad fields. */
export function applySponsorPatch(sponsor: Sponsor, patch: Record<string, unknown>, now: string): void {
  const { name, title, department, photo, tags } = patch;
  if (name !== undefined) sponsor.name = requireNonEmptyString(name, 'name');
  if (title !== undefined) sponsor.title = requireString(title, 'title');
  if (department !== undefined) sponsor.department = requireString(department, 'department');
  if (photo !== undefined) sponsor.photo = parsePhotoField(photo);
  if (tags !== undefined) sponsor.tags = requireStringArray(tags, 'tags');
  sponsor.updatedAt = now;
}
