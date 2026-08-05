import { useState, type FormEvent } from 'react';
import type { Person, Sponsor } from '../types';
import { getDescendantIds } from '../utils/orgTree';
import { colorLegendEntries, colorSchemeKey, readableTextColor } from '../utils/personColors';
import { comparePeopleBySurname } from '../utils/personNames';
import { api, photoUrl } from '../api/client';

interface PersonModalProps {
  people: Person[];
  sponsors: Sponsor[];
  person?: Person;
  onCreateSponsor: (name: string) => Promise<Sponsor>;
  onSave: (data: Partial<Person>) => Promise<void>;
  onClose: () => void;
}

export function PersonModal({ people, sponsors, person, onCreateSponsor, onSave, onClose }: PersonModalProps) {
  const colorSchemes = colorLegendEntries(people);
  const currentSchemeKey = person?.edgeColor && person.colorLabel
    ? colorSchemeKey({
        label: person.colorLabel,
        edgeColor: person.edgeColor,
        backgroundColor: person.backgroundColor,
      })
    : '';
  const [name, setName] = useState(person?.name ?? '');
  const [title, setTitle] = useState(person?.title ?? '');
  const [department, setDepartment] = useState(person?.department ?? '');
  const [managerId, setManagerId] = useState<string>(person?.managerId ?? '');
  const [sponsorNames, setSponsorNames] = useState(
    person?.sponsorIds.flatMap((id) => {
      const sponsor = sponsors.find((candidate) => candidate.id === id);
      return sponsor ? [sponsor.name] : [];
    }) ?? [],
  );
  const [sponsorInput, setSponsorInput] = useState('');
  const [tags, setTags] = useState<string[]>(person?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [photo, setPhoto] = useState<string | null>(person?.photo ?? null);
  const [useColorCoding, setUseColorCoding] = useState(
    Boolean(person?.edgeColor || person?.backgroundColor || person?.colorLabel),
  );
  const [edgeColor, setEdgeColor] = useState(person?.edgeColor ?? '#7caf78');
  const [useCustomBackground, setUseCustomBackground] = useState(Boolean(person?.backgroundColor));
  const [backgroundColor, setBackgroundColor] = useState(person?.backgroundColor ?? '#1a1d24');
  const [colorLabel, setColorLabel] = useState(person?.colorLabel ?? '');
  const [selectedSchemeKey, setSelectedSchemeKey] = useState(
    colorSchemes.some((scheme) => colorSchemeKey(scheme) === currentSchemeKey) ? currentSchemeKey : 'custom',
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const excludedManagerIds = person ? new Set([person.id, ...getDescendantIds(people, person.id)]) : new Set<string>();
  const managerOptions = people.filter((p) => !excludedManagerIds.has(p.id)).toSorted(comparePeopleBySurname);
  const departmentOptions = [
    ...new Map(
      people
        .map((candidate) => candidate.department.trim())
        .filter(Boolean)
        .map((value) => [value.toLocaleLowerCase(), value]),
    ).values(),
  ].toSorted((a, b) => a.localeCompare(b));

  function addTag() {
    const value = tagInput.trim();
    if (value && !tags.includes(value)) setTags([...tags, value]);
    setTagInput('');
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function addSponsorName() {
    const value = sponsorInput.trim();
    if (value && !sponsorNames.some((name) => name.toLocaleLowerCase() === value.toLocaleLowerCase())) {
      setSponsorNames([...sponsorNames, value]);
    }
    setSponsorInput('');
  }

  function removeSponsorName(name: string) {
    setSponsorNames(sponsorNames.filter((candidate) => candidate !== name));
  }

  function selectColorScheme(key: string) {
    setSelectedSchemeKey(key);
    if (key === 'custom') return;
    const scheme = colorSchemes.find((candidate) => colorSchemeKey(candidate) === key);
    if (!scheme) return;
    setColorLabel(scheme.label);
    setEdgeColor(scheme.edgeColor);
    setUseCustomBackground(Boolean(scheme.backgroundColor));
    if (scheme.backgroundColor) setBackgroundColor(scheme.backgroundColor);
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { filename } = await api.uploadPhoto(file);
      setPhoto(filename);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (useColorCoding && !colorLabel.trim()) {
      setError('A legend label is required when colour coding is enabled');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const pendingSponsorName = sponsorInput.trim();
      const namesToSave = pendingSponsorName
        ? [...sponsorNames, pendingSponsorName].filter(
            (name, index, names) =>
              names.findIndex((candidate) => candidate.toLocaleLowerCase() === name.toLocaleLowerCase()) === index,
          )
        : sponsorNames;
      const selectedSponsors = await Promise.all(
        namesToSave.map((sponsorName) => {
          const existingSponsor = sponsors.find(
            (sponsor) => sponsor.name.trim().toLocaleLowerCase() === sponsorName.toLocaleLowerCase(),
          );
          return existingSponsor ?? onCreateSponsor(sponsorName);
        }),
      );

      await onSave({
        name: name.trim(),
        title: title.trim(),
        department: department.trim(),
        managerId: managerId || null,
        sponsorIds: selectedSponsors.map((sponsor) => sponsor.id),
        tags,
        photo,
        edgeColor: useColorCoding ? edgeColor : null,
        backgroundColor: useColorCoding && useCustomBackground ? backgroundColor : null,
        colorLabel: useColorCoding ? colorLabel.trim() : '',
      });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  const photoPreview = photoUrl(photo);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="person-modal-title">
      <div className="modal">
        <h2 id="person-modal-title">{person ? 'Edit person' : 'Add person'}</h2>
        {person && (person.createdAt || person.updatedAt) && (
          <p className="timestamp-note">
            {person.createdAt && `Added ${new Date(person.createdAt).toLocaleString()}`}
            {person.createdAt && person.updatedAt && ' · '}
            {person.updatedAt && `Last updated ${new Date(person.updatedAt).toLocaleString()}`}
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            Department
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              list="departments"
              autoComplete="off"
            />
            <datalist id="departments">
              {departmentOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label>
            Manager
            <select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">(none - top of chart)</option>
              {managerOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Microsoft sponsors
            <div className="tag-input">
              <input
                value={sponsorInput}
                onChange={(e) => setSponsorInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addSponsorName();
                  }
                }}
                list="microsoft-sponsors"
                placeholder="Choose or type a sponsor"
              />
              <button type="button" onClick={addSponsorName}>
                Add
              </button>
            </div>
            <datalist id="microsoft-sponsors">
              {sponsors.filter((sponsor) => !sponsorNames.includes(sponsor.name)).map((sponsor) => (
                <option key={sponsor.id} value={sponsor.name}>
                  {sponsor.title}
                </option>
              ))}
            </datalist>
            <div className="person-node__tags">
              {sponsorNames.map((sponsorName) => (
                <button
                  key={sponsorName}
                  type="button"
                  className="tag-chip tag-chip--removable"
                  onClick={() => removeSponsorName(sponsorName)}
                >
                  {sponsorName} ✕
                </button>
              ))}
            </div>
          </label>
          <label>
            Tags
            <div className="tag-input">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Type a tag and press Enter"
              />
              <button type="button" onClick={addTag}>
                Add
              </button>
            </div>
            <div className="person-node__tags">
              {tags.map((tag) => (
                <span key={tag} className="tag-chip tag-chip--removable" onClick={() => removeTag(tag)}>
                  {tag} ✕
                </span>
              ))}
            </div>
          </label>
          <fieldset className="person-colors">
            <legend>Colour coding</legend>
            <label className="person-colors__toggle">
              <input
                type="checkbox"
                checked={useColorCoding}
                onChange={(event) => setUseColorCoding(event.target.checked)}
              />
              Use custom pill colours
            </label>
            {useColorCoding && (
              <div className="person-colors__fields">
                {colorSchemes.length > 0 && (
                  <label className="person-colors__scheme">
                    Colour scheme
                    <select
                      value={selectedSchemeKey}
                      onChange={(event) => selectColorScheme(event.target.value)}
                    >
                      <option value="custom">Create a new scheme</option>
                      {colorSchemes.map((scheme) => (
                        <option key={colorSchemeKey(scheme)} value={colorSchemeKey(scheme)}>
                          {scheme.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Legend label
                  <input
                    value={colorLabel}
                    onChange={(event) => {
                      setColorLabel(event.target.value);
                      setSelectedSchemeKey('custom');
                    }}
                    placeholder="e.g. Generative AI"
                    disabled={selectedSchemeKey !== 'custom'}
                    required
                  />
                </label>
                <label>
                  Edge
                  <input
                    type="color"
                    value={edgeColor}
                    onChange={(event) => {
                      setEdgeColor(event.target.value);
                      setSelectedSchemeKey('custom');
                    }}
                    disabled={selectedSchemeKey !== 'custom'}
                    aria-label="Pill edge colour"
                  />
                </label>
                <label>
                  Background
                  <input
                    type="color"
                    value={backgroundColor}
                    onChange={(event) => {
                      setBackgroundColor(event.target.value);
                      setSelectedSchemeKey('custom');
                    }}
                    disabled={selectedSchemeKey !== 'custom' || !useCustomBackground}
                    aria-label="Pill background colour"
                  />
                </label>
                <label className="person-colors__background-toggle">
                  <input
                    type="checkbox"
                    checked={useCustomBackground}
                    onChange={(event) => {
                      setUseCustomBackground(event.target.checked);
                      setSelectedSchemeKey('custom');
                    }}
                    disabled={selectedSchemeKey !== 'custom'}
                  />
                  Custom background
                </label>
                <div
                  className="person-colors__preview"
                  style={useCustomBackground
                    ? { backgroundColor, borderLeftColor: edgeColor, color: readableTextColor(backgroundColor) }
                    : { borderLeftColor: edgeColor }}
                  aria-label="Colour preview"
                >
                  {colorLabel.trim() || 'Preview'}
                </div>
              </div>
            )}
          </fieldset>
          <label>
            Photo
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handlePhotoChange} />
          </label>
          {uploading && <p>Uploading photo…</p>}
          {photoPreview && <img className="modal__photo-preview" src={photoPreview} alt="Preview" />}

          {error && <p className="error-text">{error}</p>}

          <div className="modal__actions">
            <button type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={saving || uploading}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
