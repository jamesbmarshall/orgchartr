import { useState, type FormEvent } from 'react';
import type { Sponsor } from '../types';
import { api, photoUrl } from '../api/client';
import { useModalDialog } from '../hooks/useModalDialog';

interface SponsorModalProps {
  sponsor?: Sponsor;
  onSave: (data: Partial<Sponsor>) => Promise<void>;
  onClose: () => void;
}

export function SponsorModal({ sponsor, onSave, onClose }: SponsorModalProps) {
  const [name, setName] = useState(sponsor?.name ?? '');
  const [title, setTitle] = useState(sponsor?.title ?? '');
  const [department, setDepartment] = useState(sponsor?.department ?? '');
  const [tags, setTags] = useState<string[]>(sponsor?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [photo, setPhoto] = useState<string | null>(sponsor?.photo ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useModalDialog(() => {
    if (!saving) onClose();
  });

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
      await onSave({ name: name.trim(), title: title.trim(), department: department.trim(), tags, photo });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  const photoPreview = photoUrl(photo);

  return (
    <div className="modal-overlay" ref={overlayRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="sponsor-modal-title">
      <div className="modal">
        <h2 id="sponsor-modal-title">{sponsor ? 'Edit sponsor' : 'Add sponsor'}</h2>
        {sponsor && (sponsor.createdAt || sponsor.updatedAt) && (
          <p className="timestamp-note">
            {sponsor.createdAt && `Added ${new Date(sponsor.createdAt).toLocaleString()}`}
            {sponsor.createdAt && sponsor.updatedAt && ' · '}
            {sponsor.updatedAt && `Last updated ${new Date(sponsor.updatedAt).toLocaleString()}`}
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
            <input value={department} onChange={(e) => setDepartment(e.target.value)} />
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
          {photoPreview && (
            <div className="modal__photo-row">
              <img className="modal__photo-preview" src={photoPreview} alt="Preview" />
              <button type="button" onClick={() => setPhoto(null)}>
                Remove photo
              </button>
            </div>
          )}

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
