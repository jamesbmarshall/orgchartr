/**
 * Portable chart package (.orgchartr.zip) format: manifest constants and strict parsers for the
 * untrusted JSON inside a package. Used by the server import route and the browser local-folder
 * adapter so both modes accept exactly the same packages.
 */

import type { Chart, Person, Sponsor } from './types';
import { randomId } from './ids';
import { ALLOWED_PHOTO_EXTENSIONS, photoExtension } from './images';
import { isRecord } from './validation';

export const PACKAGE_MANIFEST_FILE = 'orgchartr-package.json';
export const PACKAGE_CHART_FILE = 'chart.json';
export const PACKAGE_SPONSORS_FILE = 'sponsors.json';
export const PACKAGE_FORMAT_VERSION = 1;
export const MAX_PACKAGE_ARCHIVE_SIZE = 100 * 1024 * 1024;
export const MAX_PACKAGE_ENTRIES = 10_000;
export const MAX_EXPANDED_SIZE = 500 * 1024 * 1024;

export interface PackageManifest {
  formatVersion: number;
  createdAt: string;
  type: 'orgchartr-chart';
}

export function buildPackageManifest(): PackageManifest {
  return { formatVersion: PACKAGE_FORMAT_VERSION, createdAt: new Date().toISOString(), type: 'orgchartr-chart' };
}

export function parsePackageManifest(manifest: unknown): PackageManifest {
  if (
    !isRecord(manifest)
    || manifest.formatVersion !== PACKAGE_FORMAT_VERSION
    || manifest.type !== 'orgchartr-chart'
    || typeof manifest.createdAt !== 'string'
    || Number.isNaN(Date.parse(manifest.createdAt))
  ) {
    throw new Error('The chart package manifest is invalid or unsupported.');
  }
  return manifest as unknown as PackageManifest;
}

export function plainPhotoFilename(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.includes('/') || value.includes('\\')) {
    throw new Error('The package contains an invalid photo mapping.');
  }
  if (!ALLOWED_PHOTO_EXTENSIONS.has(photoExtension(value))) {
    throw new Error(`Unsupported photo type: ${value}`);
  }
  return value;
}

function nullableTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error('The package contains an invalid timestamp.');
  }
  return value;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`The package has an invalid ${field} mapping.`);
  }
  return value;
}

function nullableColor(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error('The package contains an invalid colour value.');
  }
  return value;
}

export function parsePackagePerson(value: unknown): Person {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string' || !value.name.trim()) {
    throw new Error('The package contains an invalid person record.');
  }
  const managerId = value.managerId === null || value.managerId === undefined
    ? null
    : typeof value.managerId === 'string' && value.managerId ? value.managerId : null;
  if (value.managerId !== null && value.managerId !== undefined && managerId === null) {
    throw new Error('The package contains an invalid manager mapping.');
  }
  let position: Person['position'] = null;
  if (value.position !== null && value.position !== undefined) {
    if (
      !isRecord(value.position)
      || typeof value.position.x !== 'number'
      || !Number.isFinite(value.position.x)
      || typeof value.position.y !== 'number'
      || !Number.isFinite(value.position.y)
    ) {
      throw new Error('The package contains an invalid chart position.');
    }
    position = { x: value.position.x, y: value.position.y };
  }
  return {
    id: value.id,
    name: value.name.trim(),
    title: typeof value.title === 'string' ? value.title : '',
    department: typeof value.department === 'string' ? value.department : '',
    photo: plainPhotoFilename(value.photo),
    managerId,
    sponsorIds: stringArray(value.sponsorIds, 'sponsor'),
    tags: stringArray(value.tags, 'tag'),
    edgeColor: nullableColor(value.edgeColor),
    backgroundColor: nullableColor(value.backgroundColor),
    colorLabel: typeof value.colorLabel === 'string' ? value.colorLabel : '',
    notes: typeof value.notes === 'string' ? value.notes.slice(0, 4000) : '',
    position,
    createdAt: nullableTimestamp(value.createdAt),
    updatedAt: nullableTimestamp(value.updatedAt),
  };
}

export function parsePackageChart(value: unknown): Chart {
  if (!isRecord(value) || typeof value.partnerName !== 'string' || !value.partnerName.trim() || !Array.isArray(value.people)) {
    throw new Error('chart.json does not contain a valid org chart.');
  }
  const people = value.people.map(parsePackagePerson);
  const personIds = new Set(people.map((person) => person.id));
  if (personIds.size !== people.length) throw new Error('The package contains duplicate person IDs.');
  if (people.some((person) => person.managerId && !personIds.has(person.managerId))) {
    throw new Error('The package contains a manager mapping outside the chart.');
  }
  const complete = new Set<string>();
  const visiting = new Set<string>();
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const visit = (personId: string): void => {
    if (complete.has(personId)) return;
    if (visiting.has(personId)) throw new Error('The package contains a cycle in its manager mappings.');
    visiting.add(personId);
    const managerId = peopleById.get(personId)?.managerId;
    if (managerId) visit(managerId);
    visiting.delete(personId);
    complete.add(personId);
  };
  people.forEach((person) => visit(person.id));
  return {
    id: '',
    partnerName: value.partnerName.trim(),
    description: typeof value.description === 'string' ? value.description : '',
    people,
  };
}

export function parsePackageSponsor(value: unknown): Sponsor {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string' || !value.name.trim()) {
    throw new Error('The package contains an invalid sponsor record.');
  }
  return {
    id: value.id,
    name: value.name.trim(),
    title: typeof value.title === 'string' ? value.title : '',
    department: typeof value.department === 'string' ? value.department : '',
    photo: plainPhotoFilename(value.photo),
    tags: stringArray(value.tags, 'sponsor tag'),
    createdAt: nullableTimestamp(value.createdAt),
    updatedAt: nullableTimestamp(value.updatedAt),
  };
}

/** Rejects any zip entry path that isn't part of the documented package layout. */
export function validatePackageEntryName(entryName: string, isDirectory: boolean): void {
  if (!entryName || entryName.includes('\\') || entryName.startsWith('/') || /^[a-z]:/i.test(entryName)) {
    throw new Error(`Unsafe package path: ${entryName || '(empty)'}`);
  }
  const normalized = entryName.endsWith('/') ? entryName.slice(0, -1) : entryName;
  if (normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Unsafe package path: ${entryName}`);
  }
  if ([PACKAGE_MANIFEST_FILE, PACKAGE_CHART_FILE, PACKAGE_SPONSORS_FILE].includes(normalized)) {
    if (isDirectory) throw new Error(`Expected a file at ${entryName}`);
    return;
  }
  if (normalized === 'assets' || normalized === 'assets/photos') {
    if (!isDirectory) throw new Error(`Expected a directory at ${entryName}`);
    return;
  }
  if (normalized.startsWith('assets/photos/')) {
    if (isDirectory || normalized.slice('assets/photos/'.length).includes('/')) {
      throw new Error(`Unexpected photo path: ${entryName}`);
    }
    plainPhotoFilename(normalized.slice('assets/photos/'.length));
    return;
  }
  throw new Error(`Unexpected package path: ${entryName}`);
}

export function mappedPhoto(photo: string | null, mapping: Map<string, string>): string | null {
  return photo ? mapping.get(photo) ?? null : null;
}

/**
 * Builds the exportable contents of a chart package: the selected people (with managers outside
 * the selection detached), the sponsors they reference, and the set of photo files to include.
 * `photoExists` reports whether a stored photo file is actually present; missing ones are dropped.
 */
export function buildPackageContents(
  chart: Chart,
  selectedIds: ReadonlySet<string>,
  allSponsors: Sponsor[],
  photoExists: (filename: string) => boolean,
): { chart: Chart; sponsors: Sponsor[]; photos: Set<string> } {
  const sponsorsById = new Map(allSponsors.map((sponsor) => [sponsor.id, sponsor]));
  const sponsorIds = new Set<string>();
  const photos = new Set<string>();
  const includePhoto = (photo: string | null): string | null => {
    if (!photo || photo.includes('/') || photo.includes('\\') || !photoExists(photo)) return null;
    photos.add(photo);
    return photo;
  };
  const people = chart.people
    .filter((person) => selectedIds.has(person.id))
    .map((person) => {
      const validSponsorIds = person.sponsorIds.filter((id) => sponsorsById.has(id));
      validSponsorIds.forEach((id) => sponsorIds.add(id));
      return {
        ...person,
        photo: includePhoto(person.photo),
        managerId: person.managerId && selectedIds.has(person.managerId) ? person.managerId : null,
        sponsorIds: validSponsorIds,
      };
    });
  const sponsors = [...sponsorIds].map((id) => {
    const sponsor = sponsorsById.get(id)!;
    return { ...sponsor, photo: includePhoto(sponsor.photo) };
  });
  return { chart: { ...chart, people }, sponsors, photos };
}

/**
 * Merges a package's sponsors into the existing sponsor list. Sponsors matching an existing one
 * (same id + name, or same name) are reused; the rest are added (with a fresh id when the
 * package's id collides with a different existing sponsor). Returns the merged list and a map
 * from package sponsor id -> id to use in the imported chart.
 */
export function mergePackageSponsors(
  originalSponsors: Sponsor[],
  packageSponsors: Sponsor[],
  photoMapping: Map<string, string>,
): { nextSponsors: Sponsor[]; sponsorMapping: Map<string, string> } {
  const nextSponsors = [...originalSponsors];
  const existingById = new Map(nextSponsors.map((sponsor) => [sponsor.id, sponsor]));
  const existingByName = new Map(nextSponsors.map((sponsor) => [sponsor.name.toLocaleLowerCase(), sponsor]));
  const sponsorMapping = new Map<string, string>();
  for (const sponsor of packageSponsors) {
    const sameId = existingById.get(sponsor.id);
    const existing = sameId?.name.toLocaleLowerCase() === sponsor.name.toLocaleLowerCase()
      ? sameId
      : existingByName.get(sponsor.name.toLocaleLowerCase());
    if (existing) {
      sponsorMapping.set(sponsor.id, existing.id);
      continue;
    }
    const id = sameId ? randomId(10) : sponsor.id;
    const imported = { ...sponsor, id, photo: mappedPhoto(sponsor.photo, photoMapping) };
    nextSponsors.push(imported);
    existingById.set(id, imported);
    existingByName.set(imported.name.toLocaleLowerCase(), imported);
    sponsorMapping.set(sponsor.id, id);
  }
  return { nextSponsors, sponsorMapping };
}
