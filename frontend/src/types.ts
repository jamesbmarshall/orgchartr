export interface Position {
  x: number;
  y: number;
}

export interface Person {
  id: string;
  name: string;
  title: string;
  department: string;
  photo: string | null;
  managerId: string | null;
  sponsorIds: string[];
  tags: string[];
  edgeColor: string | null;
  backgroundColor: string | null;
  colorLabel: string;
  position: Position | null;
  /** ISO timestamps. Null for records created before this field existed. */
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Chart {
  id: string;
  partnerName: string;
  /** Free-text notes about this chart/partner. Empty string if never set. */
  description: string;
  people: Person[];
}

export interface ChartHistoryEntry {
  /** ISO timestamp identifying (and used to look up) this snapshot. */
  timestamp: string;
  personCount: number;
}

export interface SponsorUsageEntry {
  chartId: string;
  chartName: string;
  personId: string;
  personName: string;
}

export interface ChartIndexEntry {
  id: string;
  partnerName: string;
  personCount: number;
  lastUpdated: string;
}

export interface Sponsor {
  id: string;
  name: string;
  title: string;
  department: string;
  photo: string | null;
  tags: string[];
  createdAt: string | null;
  updatedAt: string | null;
}
