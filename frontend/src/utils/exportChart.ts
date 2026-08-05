import type { Person, Sponsor } from '../types';
import { computeAutoLayout, NODE_WIDTH, NODE_HEIGHT } from '../layout/autoLayout';
import { photoUrl } from '../api/client';

export type ExportFormat = 'svg' | 'png' | 'csv' | 'json';

export const EXPORT_FORMATS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: 'svg', label: 'SVG (vector)', hint: 'Best for PowerPoint — insert as a picture and it stays sharp at any size.' },
  { value: 'png', label: 'PNG (image)', hint: 'Drop straight onto a slide when you want a flat picture.' },
  { value: 'csv', label: 'CSV (spreadsheet)', hint: 'One row per person, for Excel or bulk edits.' },
  { value: 'json', label: 'JSON (data)', hint: 'Full structured data, including positions and tags.' },
];

const PNG_SCALE = 2;
const MARGIN = 40;
const TITLE_HEIGHT = 56;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Fetches a photo and returns it as a data URL so exported files are self-contained. */
async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function loadPhotos(people: Person[]): Promise<Map<string, string>> {
  const entries = await Promise.all(
    people.map(async (person) => {
      const url = photoUrl(person.photo);
      if (!url) return null;
      const dataUrl = await toDataUrl(url);
      return dataUrl ? ([person.id, dataUrl] as const) : null;
    }),
  );
  return new Map(entries.filter((entry): entry is readonly [string, string] => entry !== null));
}

interface SvgOptions {
  title: string;
  sponsorById: Map<string, Sponsor>;
}

/** Renders the given people as a standalone, light-themed SVG suitable for PowerPoint. */
export async function buildSvg(people: Person[], { title, sponsorById }: SvgOptions): Promise<string> {
  if (people.length === 0) throw new Error('Nothing to export — select at least one person.');

  const positions = computeAutoLayout(people, true);
  const placed = people.map((person) => {
    const pos = positions.get(person.id) ?? { x: 0, y: 0 };
    // dagre returns node centres; convert to top-left corners.
    return { person, x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 };
  });
  const byId = new Map(placed.map((entry) => [entry.person.id, entry]));

  const minX = Math.min(...placed.map((n) => n.x));
  const minY = Math.min(...placed.map((n) => n.y));
  const maxX = Math.max(...placed.map((n) => n.x + NODE_WIDTH));
  const maxY = Math.max(...placed.map((n) => n.y + NODE_HEIGHT));
  const offsetX = MARGIN - minX;
  const offsetY = MARGIN + TITLE_HEIGHT - minY;
  const width = maxX - minX + MARGIN * 2;
  const height = maxY - minY + MARGIN * 2 + TITLE_HEIGHT;

  const photos = await loadPhotos(people);

  const edges = placed
    .filter(({ person }) => person.managerId && byId.has(person.managerId))
    .map(({ person, x, y }) => {
      const manager = byId.get(person.managerId as string)!;
      const x1 = manager.x + offsetX + NODE_WIDTH / 2;
      const y1 = manager.y + offsetY + NODE_HEIGHT;
      const x2 = x + offsetX + NODE_WIDTH / 2;
      const y2 = y + offsetY;
      const mid = (y1 + y2) / 2;
      return `<path d="M ${x1} ${y1} V ${mid} H ${x2} V ${y2}" fill="none" stroke="#b4bcc9" stroke-width="1.5" />`;
    })
    .join('\n    ');

  const nodes = placed
    .map(({ person, x, y }) => {
      const left = x + offsetX;
      const top = y + offsetY;
      const photo = photos.get(person.id);
      const sponsor = person.sponsorId ? sponsorById.get(person.sponsorId) : undefined;
      const avatar = photo
        ? `<clipPath id="clip-${escapeXml(person.id)}"><circle cx="${left + 30}" cy="${top + 32}" r="18" /></clipPath>` +
          `<image href="${escapeXml(photo)}" x="${left + 12}" y="${top + 14}" width="36" height="36" ` +
          `preserveAspectRatio="xMidYMid slice" clip-path="url(#clip-${escapeXml(person.id)})" />`
        : `<circle cx="${left + 30}" cy="${top + 32}" r="18" fill="#4f8cff" />` +
          `<text x="${left + 30}" y="${top + 37}" text-anchor="middle" font-size="14" font-weight="600" fill="#ffffff">${escapeXml(
            initials(person.name),
          )}</text>`;

      const lines: string[] = [
        `<text x="${left + 58}" y="${top + 28}" font-size="14" font-weight="600" fill="#1a1d24">${escapeXml(
          truncate(person.name, 24),
        )}</text>`,
      ];
      if (person.title) {
        lines.push(
          `<text x="${left + 58}" y="${top + 45}" font-size="11" fill="#5a6273">${escapeXml(truncate(person.title, 28))}</text>`,
        );
      }
      if (person.department) {
        lines.push(
          `<text x="${left + 58}" y="${top + 60}" font-size="11" fill="#5a6273">${escapeXml(
            truncate(person.department, 28),
          )}</text>`,
        );
      }
      const footer = [sponsor ? `Sponsor: ${sponsor.name}` : null, person.tags.length ? person.tags.join(', ') : null]
        .filter(Boolean)
        .join(' · ');
      if (footer) {
        lines.push(
          `<text x="${left + 12}" y="${top + 92}" font-size="10" fill="#7a8394">${escapeXml(truncate(footer, 40))}</text>`,
        );
      }

      return (
        `<g>` +
        `<rect x="${left}" y="${top}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="10" ` +
        `fill="#ffffff" stroke="#d5dae3" stroke-width="1.5" />` +
        avatar +
        lines.join('') +
        `</g>`
      );
    })
    .join('\n    ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Segoe UI, Helvetica, Arial, sans-serif">
  <rect width="${width}" height="${height}" fill="#ffffff" />
  <text x="${MARGIN}" y="${MARGIN}" font-size="20" font-weight="600" fill="#1a1d24">${escapeXml(title)}</text>
  <g>
    ${edges}
  </g>
  <g>
    ${nodes}
  </g>
</svg>`;
}

/** Rasterises an SVG string to a PNG blob via an offscreen canvas. */
export async function svgToPngBlob(svg: string): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not render the chart image.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * PNG_SCALE));
    canvas.height = Math.max(1, Math.round(image.height * PNG_SCALE));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not render the chart image.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not render the chart image.'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildCsv(people: Person[], sponsorById: Map<string, Sponsor>): string {
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const header = ['Name', 'Title', 'Department', 'Manager', 'Sponsor', 'Tags'];
  const rows = people.map((person) =>
    [
      person.name,
      person.title,
      person.department,
      (person.managerId && nameById.get(person.managerId)) || '',
      (person.sponsorId && sponsorById.get(person.sponsorId)?.name) || '',
      person.tags.join('; '),
    ]
      .map(csvCell)
      .join(','),
  );
  return [header.join(','), ...rows].join('\r\n');
}

export function buildJson(partnerName: string, people: Person[]): string {
  return JSON.stringify({ partnerName, exportedAt: new Date().toISOString(), people }, null, 2);
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'org-chart'
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
