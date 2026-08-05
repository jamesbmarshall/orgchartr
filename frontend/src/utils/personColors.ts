import type { Person } from '../types';

export interface ColorLegendEntry {
  label: string;
  edgeColor: string;
  backgroundColor: string | null;
}

export function colorSchemeKey({ label, edgeColor, backgroundColor }: ColorLegendEntry): string {
  return `${label.toLocaleLowerCase()}|${edgeColor.toLocaleLowerCase()}|${backgroundColor?.toLocaleLowerCase() ?? 'default'}`;
}

export function readableTextColor(backgroundColor: string): '#16181d' | '#f7f8fa' {
  const red = Number.parseInt(backgroundColor.slice(1, 3), 16);
  const green = Number.parseInt(backgroundColor.slice(3, 5), 16);
  const blue = Number.parseInt(backgroundColor.slice(5, 7), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance > 150 ? '#16181d' : '#f7f8fa';
}

export function colorLegendEntries(people: Person[]): ColorLegendEntry[] {
  const entries = new Map<string, ColorLegendEntry>();
  for (const person of people) {
    if (!person.edgeColor || !person.colorLabel.trim()) continue;
    const entry = {
      label: person.colorLabel.trim(),
      edgeColor: person.edgeColor,
      backgroundColor: person.backgroundColor,
    };
    entries.set(colorSchemeKey(entry), entry);
  }
  return [...entries.values()].toSorted((a, b) => a.label.localeCompare(b.label));
}