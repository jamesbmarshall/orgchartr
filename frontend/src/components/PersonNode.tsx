import { Handle, Position as FlowPosition, type NodeProps } from '@xyflow/react';
import { Pencil, Trash2 } from 'lucide-react';
import type { Person, Sponsor } from '../types';
import { photoUrl } from '../api/client';

export interface PersonNodeData extends Record<string, unknown> {
  person: Person;
  sponsor: Sponsor | undefined;
  onEdit: (person: Person) => void;
  onDelete: (person: Person) => void;
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function PersonNode({ data }: NodeProps & { data: PersonNodeData }) {
  const { person, sponsor, onEdit, onDelete } = data;
  const photo = photoUrl(person.photo);

  return (
    <div className="person-node">
      <Handle type="target" position={FlowPosition.Top} />
      <div className="person-node__header">
        {photo ? (
          <img className="person-node__avatar" src={photo} alt={person.name} />
        ) : (
          <div className="person-node__avatar person-node__avatar--placeholder">{initials(person.name)}</div>
        )}
        <div className="person-node__identity">
          <div className="person-node__name">{person.name}</div>
          {person.title && <div className="person-node__title">{person.title}</div>}
          {person.department && <div className="person-node__department">{person.department}</div>}
        </div>
      </div>

      {sponsor && (
        <div className="person-node__sponsor" title={`Microsoft sponsor: ${sponsor.name}`}>
          🎗️ {sponsor.name}
        </div>
      )}

      {person.tags.length > 0 && (
        <div className="person-node__tags">
          {person.tags.map((tag) => (
            <span key={tag} className="tag-chip">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="person-node__actions">
        <button
          type="button"
          className="person-node__action nodrag"
          title="Edit person"
          aria-label={`Edit ${person.name}`}
          onClick={() => onEdit(person)}
        >
          <Pencil aria-hidden="true" />
        </button>
        <button
          type="button"
          className="person-node__action danger nodrag"
          title="Remove person"
          aria-label={`Remove ${person.name}`}
          onClick={() => onDelete(person)}
        >
          <Trash2 aria-hidden="true" />
        </button>
      </div>

      <Handle type="source" position={FlowPosition.Bottom} />
    </div>
  );
}
