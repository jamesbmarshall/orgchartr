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
}

export interface Chart {
  id: string;
  partnerName: string;
  people: Person[];
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
}
