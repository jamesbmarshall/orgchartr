import type { Person, Sponsor } from '../types';

const EXCEL_MAX_COLUMNS = 16_384;
const IDENTITY_COLUMN_COUNT = 2;
const MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface SponsorColumn {
  id: string;
  heading: string;
}

function uniqueHeading(value: string, usedHeadings: Set<string>): string {
  let heading = value;
  let suffix = 2;
  while (usedHeadings.has(heading.toLocaleLowerCase())) {
    heading = `${value} [${suffix}]`;
    suffix += 1;
  }
  usedHeadings.add(heading.toLocaleLowerCase());
  return heading;
}

function buildSponsorColumns(people: Person[], sponsorById: Map<string, Sponsor>): SponsorColumn[] {
  const sponsorIds = new Set(people.flatMap((person) => person.sponsorIds));
  const sponsors = [...sponsorIds]
    .flatMap((id) => {
      const sponsor = sponsorById.get(id);
      return sponsor ? [{ id, sponsor }] : [];
    })
    .sort((left, right) =>
      left.sponsor.name.localeCompare(right.sponsor.name, undefined, { sensitivity: 'base' }) ||
      left.sponsor.title.localeCompare(right.sponsor.title, undefined, { sensitivity: 'base' }) ||
      left.sponsor.department.localeCompare(right.sponsor.department, undefined, { sensitivity: 'base' }) ||
      left.id.localeCompare(right.id),
    );

  const nameCounts = new Map<string, number>();
  for (const { sponsor } of sponsors) {
    const key = sponsor.name.toLocaleLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  const usedHeadings = new Set(['stakeholder name', 'role']);
  return sponsors.map(({ id, sponsor }) => {
    const duplicateName = (nameCounts.get(sponsor.name.toLocaleLowerCase()) ?? 0) > 1;
    const context = [sponsor.title, sponsor.department].filter(Boolean).join(' - ');
    const preferredHeading = duplicateName && context ? `${sponsor.name} (${context})` : sponsor.name;
    return { id, heading: uniqueHeading(preferredHeading, usedHeadings) };
  });
}

export async function buildSponsorshipWorkbook(
  people: Person[],
  sponsorById: Map<string, Sponsor>,
): Promise<Blob> {
  const sponsorColumns = buildSponsorColumns(people, sponsorById);
  if (sponsorColumns.length + IDENTITY_COLUMN_COUNT > EXCEL_MAX_COLUMNS) {
    throw new Error('This export has too many sponsor columns for an Excel worksheet.');
  }

  const excelJs = await import('exceljs');
  const Workbook = excelJs.default?.Workbook ?? excelJs.Workbook;
  const workbook = new Workbook();
  workbook.creator = 'orgchartr';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Sponsorship', {
    views: [{ state: 'frozen', xSplit: IDENTITY_COLUMN_COUNT, ySplit: 1, topLeftCell: 'C2' }],
  });
  worksheet.properties.defaultRowHeight = 20;

  worksheet.addTable({
    name: 'SponsorshipTable',
    ref: 'A1',
    headerRow: true,
    totalsRow: false,
    style: {
      theme: 'TableStyleMedium2',
      showRowStripes: true,
    },
    columns: [
      { name: 'Stakeholder Name', filterButton: true },
      { name: 'Role', filterButton: true },
      ...sponsorColumns.map(({ heading }) => ({ name: heading, filterButton: true })),
    ],
    rows: people.map((person) => {
      const assignedSponsorIds = new Set(person.sponsorIds);
      return [
        person.name,
        person.title,
        ...sponsorColumns.map(({ id }) => (assignedSponsorIds.has(id) ? 'X' : '')),
      ];
    }),
  });

  worksheet.getColumn(1).width = 30;
  worksheet.getColumn(2).width = 30;
  for (let columnNumber = 3; columnNumber <= sponsorColumns.length + IDENTITY_COLUMN_COUNT; columnNumber += 1) {
    const sponsorColumn = sponsorColumns[columnNumber - 3];
    const column = worksheet.getColumn(columnNumber);
    column.width = Math.min(32, Math.max(14, sponsorColumn.heading.length + 2));
    column.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }

  worksheet.eachRow((row, rowNumber) => {
    row.font = { name: 'Arial', size: 10, bold: rowNumber === 1 };
    row.alignment = { vertical: 'middle', wrapText: rowNumber === 1 };
  });
  worksheet.getRow(1).height = 30;

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([new Uint8Array(buffer)], { type: MIME_TYPE });
}