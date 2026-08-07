import { useState, type ChangeEvent } from 'react';
import type { Person, Sponsor } from '../types';
import { parseCsv } from '../utils/csv';

interface ImportModalProps {
  people: Person[];
  sponsors: Sponsor[];
  onAddPerson: (data: Partial<Person>) => Promise<Person>;
  onUpdatePerson: (personId: string, patch: Partial<Person>) => Promise<void>;
  onCreateSponsor: (name: string) => Promise<Sponsor>;
  onClose: () => void;
}

interface ImportRow {
  name: string;
  title: string;
  department: string;
  manager: string;
  sponsorNames: string[];
  tags: string[];
  notes: string;
  colorLabel: string;
  edgeColor: string;
  backgroundColor: string;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function parseRows(text: string): ImportRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const [header, ...dataRows] = rows;
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const nameIdx = col('Name');
  const titleIdx = col('Title');
  const deptIdx = col('Department');
  const managerIdx = col('Manager');
  const sponsorsIdx = col('Sponsors');
  const tagsIdx = col('Tags');
  const notesIdx = col('Notes');
  const colorLabelIdx = col('Colour label');
  const edgeColorIdx = col('Edge colour');
  const backgroundColorIdx = col('Background colour');

  const cell = (row: string[], idx: number) => (idx >= 0 ? (row[idx] ?? '').trim() : '');

  return dataRows
    .map((row) => ({
      name: cell(row, nameIdx),
      title: cell(row, titleIdx),
      department: cell(row, deptIdx),
      manager: cell(row, managerIdx),
      sponsorNames: cell(row, sponsorsIdx)
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean),
      tags: cell(row, tagsIdx)
        .split(';')
        .map((t) => t.trim())
        .filter(Boolean),
      notes: cell(row, notesIdx),
      colorLabel: cell(row, colorLabelIdx),
      edgeColor: cell(row, edgeColorIdx),
      backgroundColor: cell(row, backgroundColorIdx),
    }))
    .filter((row) => row.name);
}

/**
 * Bulk-imports people from a CSV file matching the app's own export format
 * (Name, Title, Department, Manager, Sponsors, Tags, Notes, Colour label, Edge colour, Background colour).
 * Sponsors named in the file are matched case-insensitively against the existing directory, or created.
 * Manager is resolved by name, preferring other rows in the same file, then existing chart people -
 * the same limitation the CSV export already has when a manager falls outside the exported scope.
 */
export function ImportModal({ people, sponsors, onAddPerson, onUpdatePerson, onCreateSponsor, onClose }: ImportModalProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setSummary(null);
    try {
      const text = await file.text();
      const parsed = parseRows(text);
      if (parsed.length === 0) {
        setError('No importable rows were found. Make sure the file has a "Name" column with at least one row.');
        setFileName(null);
        setRows([]);
        return;
      }
      setFileName(file.name);
      setRows(parsed);
    } catch {
      setError('Could not read that file.');
    }
  }

  async function handleImport() {
    setImporting(true);
    setError(null);
    setProgress(0);

    const sponsorByName = new Map(sponsors.map((s) => [s.name.toLocaleLowerCase(), s]));
    const createdByName = new Map<string, Person>();
    let failures = 0;

    // Pass 1: resolve/create sponsors, then create each person (manager link set in pass 2).
    for (const [index, row] of rows.entries()) {
      try {
        const sponsorIds: string[] = [];
        for (const sponsorName of row.sponsorNames) {
          const key = sponsorName.toLocaleLowerCase();
          let sponsor = sponsorByName.get(key);
          if (!sponsor) {
            sponsor = await onCreateSponsor(sponsorName);
            sponsorByName.set(key, sponsor);
          }
          sponsorIds.push(sponsor.id);
        }
        const person = await onAddPerson({
          name: row.name,
          title: row.title,
          department: row.department,
          sponsorIds,
          tags: row.tags,
          notes: row.notes,
          colorLabel: row.colorLabel,
          edgeColor: HEX_COLOR.test(row.edgeColor) ? row.edgeColor : null,
          backgroundColor: HEX_COLOR.test(row.backgroundColor) ? row.backgroundColor : null,
        });
        createdByName.set(row.name.toLocaleLowerCase(), person);
      } catch {
        failures += 1;
      }
      setProgress(Math.round(((index + 1) / rows.length) * 100));
    }

    // Pass 2: resolve manager names, preferring newly-imported people, then existing chart people.
    const existingByName = new Map(people.map((p) => [p.name.toLocaleLowerCase(), p]));
    for (const row of rows) {
      if (!row.manager) continue;
      const person = createdByName.get(row.name.toLocaleLowerCase());
      if (!person) continue;
      const managerKey = row.manager.toLocaleLowerCase();
      const manager = createdByName.get(managerKey) ?? existingByName.get(managerKey);
      if (manager && manager.id !== person.id) {
        try {
          await onUpdatePerson(person.id, { managerId: manager.id });
        } catch {
          failures += 1;
        }
      }
    }

    const importedCount = createdByName.size;
    setSummary(
      failures > 0
        ? `Imported ${importedCount} of ${rows.length} row${rows.length === 1 ? '' : 's'} (${failures} failed).`
        : `Imported ${importedCount} ${importedCount === 1 ? 'person' : 'people'}.`,
    );
    setRows([]);
    setFileName(null);
    setImporting(false);
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="import-modal-title">
      <div className="modal">
        <h2 id="import-modal-title">Import people from CSV</h2>
        <p className="export-hint">
          Upload a CSV file matching the export format: Name, Title, Department, Manager, Sponsors, Tags, Notes,
          Colour label, Edge colour, Background colour. Sponsors and Tags may list multiple values separated by semicolons.
          Manager is matched by name against people already in this chart or elsewhere in the file.
        </p>

        <input type="file" accept=".csv,text/csv" onChange={handleFileChange} disabled={importing} />

        {fileName && rows.length > 0 && (
          <p className="export-hint">
            {fileName}: {rows.length} row{rows.length === 1 ? '' : 's'} ready to import.
          </p>
        )}

        {error && <p className="error-text">{error}</p>}
        {summary && <p>{summary}</p>}
        {importing && <p>Importing… {progress}%</p>}

        <div className="modal__actions">
          <button type="button" onClick={onClose}>
            {summary ? 'Close' : 'Cancel'}
          </button>
          {rows.length > 0 && (
            <button type="button" className="primary" onClick={handleImport} disabled={importing}>
              {importing ? 'Importing…' : `Import ${rows.length} ${rows.length === 1 ? 'person' : 'people'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
