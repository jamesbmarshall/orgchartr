import { Handle, Position as FlowPosition, type NodeProps } from '@xyflow/react';
import { ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Person, Sponsor } from '../types';
import { photoUrl } from '../api/client';
import { readableTextColor } from '../utils/personColors';
import { personNodeWidth } from '../layout/autoLayout';

export interface PersonNodeData extends Record<string, unknown> {
  person: Person;
  sponsors: Sponsor[];
  hasDirectReports: boolean;
  collapsed: boolean;
  onToggleCollapsed: (personId: string) => void;
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
  const { person, sponsors, hasDirectReports, collapsed, onToggleCollapsed, onEdit, onDelete } = data;
  const photo = photoUrl(person.photo);
  const backgroundColor = person.backgroundColor ?? 'var(--surface)';
  const edgeColor = person.edgeColor ?? 'var(--border)';
  const textColor = person.backgroundColor ? readableTextColor(person.backgroundColor) : 'var(--text)';
  const nodeStyle = {
    '--person-background': backgroundColor,
    '--person-edge': edgeColor,
    '--person-text': textColor,
    '--person-width': `${personNodeWidth(person.name)}px`,
  } as CSSProperties;

  return (
    <div className="person-node" style={nodeStyle}>
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

      {sponsors.length > 0 && (
        <div className="person-node__sponsor" title={`Microsoft sponsors: ${sponsors.map((sponsor) => sponsor.name).join(', ')}`}>
          🎗️ {sponsors.map((sponsor) => sponsor.name).join(', ')}
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
        {hasDirectReports && (
          <button
            type="button"
            className="person-node__action nodrag"
            title={collapsed ? 'Expand branch' : 'Collapse branch'}
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${person.name}'s branch`}
            aria-expanded={!collapsed}
            onClick={() => onToggleCollapsed(person.id)}
          >
            {collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          </button>
        )}
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
