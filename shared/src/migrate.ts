import type { Chart, Person, Sponsor } from './types';

export type StoredPerson = Omit<Person, 'sponsorIds' | 'notes' | 'createdAt' | 'updatedAt'> & {
  sponsorIds?: string[];
  sponsorId?: string | null;
  edgeColor?: string | null;
  backgroundColor?: string | null;
  colorLabel?: string;
  notes?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type StoredChart = Omit<Chart, 'people' | 'description'> & {
  people: StoredPerson[];
  description?: string;
};

export type StoredSponsor = Omit<Sponsor, 'createdAt' | 'updatedAt'> & {
  createdAt?: string | null;
  updatedAt?: string | null;
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const LEGACY_DEFAULT_BACKGROUND = '#1a1d24';

export function parseColor(value: unknown): string | null {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : null;
}

/** Migrates legacy field shapes (singular sponsorId, missing timestamps, etc) to the current Chart shape. */
export function migrateStoredChart(chart: StoredChart): Chart {
  return {
    ...chart,
    description: typeof chart.description === 'string' ? chart.description : '',
    people: chart.people.map(({ sponsorId, ...person }) => ({
      ...person,
      sponsorIds: Array.isArray(person.sponsorIds) ? person.sponsorIds : sponsorId ? [sponsorId] : [],
      edgeColor: parseColor(person.edgeColor),
      backgroundColor: person.backgroundColor?.toLocaleLowerCase() === LEGACY_DEFAULT_BACKGROUND
        ? null
        : parseColor(person.backgroundColor),
      colorLabel: typeof person.colorLabel === 'string' ? person.colorLabel : '',
      notes: typeof person.notes === 'string' ? person.notes : '',
      createdAt: typeof person.createdAt === 'string' ? person.createdAt : null,
      updatedAt: typeof person.updatedAt === 'string' ? person.updatedAt : null,
    })),
  };
}

export function migrateStoredSponsors(sponsors: StoredSponsor[]): Sponsor[] {
  return sponsors.map((sponsor) => ({
    ...sponsor,
    createdAt: typeof sponsor.createdAt === 'string' ? sponsor.createdAt : null,
    updatedAt: typeof sponsor.updatedAt === 'string' ? sponsor.updatedAt : null,
  }));
}
