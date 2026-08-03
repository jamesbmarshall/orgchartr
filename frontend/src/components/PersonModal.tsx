import { useState, type FormEvent } from 'react';
import type { Person, Sponsor } from '../types';
import { getDescendantIds } from '../utils/orgTree';
import { api, photoUrl } from '../api/client';

interface PersonModalProps {
  people: Person[];
  sponsors: Sponsor[];
  person?: Person;
  onSave: (data: Partial<Person>) => Promise<void>;
  onClose: () => void;
}

export function PersonModal({ people, sponsors, person, onSave, onClose }: PersonModalProps) {
  const [name, setName] = useState(person?.name ?? '');
  const [title, setTitle] = useState(person?.title ?? '');
  const [department, setDepartment] = useState(person?.department ?? '');
  const [managerId, setManagerId] = useState<string>(person?.managerId ?? '');
  const [sponsorId, setSponsorId] = useState<string>(person?.sponsorId ?? '');
  const [tags, setTags] = useState<string[]>(person?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [photo, setPhoto] = useState<string | null>(person?.photo ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const excludedManagerIds = person ? new Set([person.id, ...getDescendantIds(people, person.id)]) : new Set<string>();
  const managerOptions = people.filter((p) => !excludedManagerIds.has(p.id));

  function addTag() {
    const value = tagInput.trim();
    if (value && !tags.includes(value)) setTags([...tags, value]);
    setTagInput('');
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
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
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        title: title.trim(),
        department: department.trim(),
        managerId: managerId || null,
        sponsorId: sponsorId || null,
        tags,
        photo,
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
            <input value={department} onChange={(e) => setDepartment(e.target.value)} />
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
            Microsoft sponsor
            <select value={sponsorId} onChange={(e) => setSponsorId(e.target.value)}>
              <option value="">(none)</option>
              {sponsors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.title}
                </option>
              ))}
            </select>
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
