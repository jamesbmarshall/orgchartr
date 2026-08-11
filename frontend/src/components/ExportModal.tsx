import { useMemo, useState } from 'react';
import type { Person, Sponsor } from '../types';
import { api } from '../api/client';
import { useModalDialog } from '../hooks/useModalDialog';
import { buildSubset, getDescendantIds } from '../utils/orgTree';
import { buildSponsorshipWorkbook } from '../utils/exportSponsorshipWorkbook';
import {
  EXPORT_FORMATS,
  buildCsv,
  buildJson,
  buildSvg,
  downloadBlob,
  slugify,
  svgToPngBlob,
  type ExportFormat,
} from '../utils/exportChart';

type Scope = 'all' | 'selection';
type ImageStyle = 'framed' | 'clean';

interface ExportModalProps {
  chartId: string;
  partnerName: string;
  people: Person[];
  sponsors: Sponsor[];
  onClose: () => void;
}

export function ExportModal({ chartId, partnerName, people, sponsors, onClose }: ExportModalProps) {
  const [scope, setScope] = useState<Scope>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [includeDescendants, setIncludeDescendants] = useState(true);
  const [includeAncestors, setIncludeAncestors] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('svg');
  const [imageStyle, setImageStyle] = useState<ImageStyle>('framed');
  const [preparedBy, setPreparedBy] = useState('');
  const [revision, setRevision] = useState('01');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useModalDialog(() => {
    if (!busy) onClose();
  });

  const sponsorById = useMemo(() => new Map(sponsors.map((s) => [s.id, s])), [sponsors]);

  const exportPeople = useMemo(() => {
    if (scope === 'all') return people;
    return buildSubset(people, selectedIds, { includeDescendants, includeAncestors });
  }, [scope, people, selectedIds, includeDescendants, includeAncestors]);

  /** People listed in tree order so branches read top-down. */
  const orderedPeople = useMemo(() => {
    const childrenOf = new Map<string | null, Person[]>();
    const ids = new Set(people.map((p) => p.id));
    for (const person of people) {
      const key = person.managerId && ids.has(person.managerId) ? person.managerId : null;
      const bucket = childrenOf.get(key) ?? [];
      bucket.push(person);
      childrenOf.set(key, bucket);
    }
    const ordered: { person: Person; depth: number }[] = [];
    const visited = new Set<string>();
    const walk = (parentId: string | null, depth: number) => {
      for (const person of childrenOf.get(parentId) ?? []) {
        if (visited.has(person.id)) continue;
        visited.add(person.id);
        ordered.push({ person, depth });
        walk(person.id, depth + 1);
      }
    };
    walk(null, 0);
    for (const person of people) {
      if (!visited.has(person.id)) ordered.push({ person, depth: 0 });
    }
    return ordered;
  }, [people]);

  function toggle(personId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }

  async function handleExport() {
    setError(null);
    if (exportPeople.length === 0) {
      setError('Select at least one person to export.');
      return;
    }
    setBusy(true);
    try {
      const base = slugify(partnerName);
      if (format === 'csv') {
        downloadBlob(new Blob([buildCsv(exportPeople, sponsorById)], { type: 'text/csv;charset=utf-8' }), `${base}.csv`);
      } else if (format === 'xlsx') {
        downloadBlob(await buildSponsorshipWorkbook(exportPeople, sponsorById), `${base}.xlsx`);
      } else if (format === 'json') {
        downloadBlob(
          new Blob([buildJson(partnerName, exportPeople)], { type: 'application/json' }),
          `${base}.json`,
        );
      } else if (format === 'package') {
        const blob = await api.exportChartPackage(chartId, exportPeople.map((person) => person.id));
        downloadBlob(blob, `${base}.orgchartr.zip`);
      } else {
        const svg = await buildSvg(exportPeople, {
          title: partnerName,
          sponsorById,
          preparedBy,
          revision,
          framed: imageStyle === 'framed',
        });
        if (format === 'svg') {
          downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${base}.svg`);
        } else {
          downloadBlob(await svgToPngBlob(svg), `${base}.png`);
        }
      }
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const activeFormat = EXPORT_FORMATS.find((f) => f.value === format);

  return (
    <div className="modal-overlay" ref={overlayRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="export-title">
      <div className="modal modal--wide">
        <h2 id="export-title">Export org chart</h2>

        <fieldset className="export-scope">
          <legend>What to export</legend>
          <label>
            <input type="radio" name="scope" checked={scope === 'all'} onChange={() => setScope('all')} />
            Entire chart ({people.length} {people.length === 1 ? 'person' : 'people'})
          </label>
          <label>
            <input type="radio" name="scope" checked={scope === 'selection'} onChange={() => setScope('selection')} />
            Selected branches or people
          </label>
        </fieldset>

        {scope === 'selection' && (
          <>
            <div className="export-options">
              <label>
                <input
                  type="checkbox"
                  checked={includeDescendants}
                  onChange={(e) => setIncludeDescendants(e.target.checked)}
                />
                Include everyone reporting into the selected people
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={includeAncestors}
                  onChange={(e) => setIncludeAncestors(e.target.checked)}
                />
                Include their management chain
              </label>
            </div>

            <div className="export-people">
              {orderedPeople.map(({ person, depth }) => {
                const reportCount = getDescendantIds(people, person.id).size;
                return (
                  <label key={person.id} className="export-people__row" style={{ paddingLeft: `${depth * 16}px` }}>
                    <input type="checkbox" checked={selectedIds.has(person.id)} onChange={() => toggle(person.id)} />
                    <span className="export-people__name">{person.name}</span>
                    {person.title && <span className="export-people__meta">{person.title}</span>}
                    {reportCount > 0 && <span className="export-people__meta">+{reportCount} reports</span>}
                  </label>
                );
              })}
            </div>
          </>
        )}

        <fieldset className="export-scope">
          <legend>Format</legend>
          {EXPORT_FORMATS.map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name="format"
                checked={format === option.value}
                onChange={() => setFormat(option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        {activeFormat && <p className="export-hint">{activeFormat.hint}</p>}

        {(format === 'svg' || format === 'png') && (
          <fieldset className="export-scope">
            <legend>Image style</legend>
            <label>
              <input
                type="radio"
                name="image-style"
                checked={imageStyle === 'framed'}
                onChange={() => setImageStyle('framed')}
              />
              Framed drawing
            </label>
            <label>
              <input
                type="radio"
                name="image-style"
                checked={imageStyle === 'clean'}
                onChange={() => setImageStyle('clean')}
              />
              Clean sheet
            </label>
          </fieldset>
        )}

        {(format === 'svg' || format === 'png') && imageStyle === 'framed' && (
          <fieldset className="export-scope">
            <legend>Drawing details</legend>
            <div className="export-details">
              <label>
                Prepared by
                <input
                  value={preparedBy}
                  onChange={(event) => setPreparedBy(event.target.value)}
                  placeholder="Your name or team"
                  maxLength={40}
                />
              </label>
              <label>
                Revision
                <input value={revision} onChange={(event) => setRevision(event.target.value)} maxLength={12} />
              </label>
            </div>
            <p className="export-hint">The chart name and export time are added automatically.</p>
          </fieldset>
        )}

        <p className="export-hint">
          {exportPeople.length} {exportPeople.length === 1 ? 'person' : 'people'} will be exported.
        </p>

        {error && <p className="error-text">{error}</p>}

        <div className="modal__actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={handleExport} disabled={busy}>
            {busy ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
