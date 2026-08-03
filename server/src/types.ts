export interface Person {
  id: string;
  name: string;
  title: string;
  department: string;
  photo: string | null;
  managerId: string | null;
  sponsorId: string | null;
  tags: string[];
  position: { x: number; y: number } | null;
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
