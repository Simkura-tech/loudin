/**
 * GroupPicker — a Group <select> with an inline "+ new group" affordance.
 *
 * The dropdown lists the company's groups plus a "No group" option. The "+"
 * button next to it swaps the row into a quick-create input; saving creates
 * the group via the API, tells the parent to append it to its list, and
 * auto-selects the new group.
 *
 * Renaming / deleting stays on /app/groups — quick-create is the only inline
 * action so the picker can't grow into a full management surface.
 */

import { useState } from 'react';
import styled from '@emotion/styled';
import { IconCheck, IconPlus, IconX } from '@tabler/icons-react';
import { peopleGroupsApi, type PeopleGroup } from '../../services/access/peopleGroups';

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const Select = styled.select`
  flex: 1;
  height: 40px;
  padding: 0 12px;
  border-radius: 9px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  font-size: 14px;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.brand.primary};
  }
`;

const Input = styled.input`
  flex: 1;
  height: 40px;
  padding: 0 12px;
  border-radius: 9px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  font-size: 14px;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.brand.primary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.brand.primary}26;
  }
`;

const SquareButton = styled.button<{ $variant?: 'default' | 'primary' | 'danger' }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 9px;
  border: 1px solid
    ${({ theme, $variant }) =>
      $variant === 'primary' ? theme.colors.brand.primary : theme.colors.border.light};
  background: ${({ theme, $variant }) =>
    $variant === 'primary' ? theme.colors.brand.primary : theme.colors.background.primary};
  color: ${({ theme, $variant }) =>
    $variant === 'primary' ? '#fff'
  : $variant === 'danger'  ? '#b91c1c'
  :                          theme.colors.text.secondary};
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s ease;

  &:hover {
    background: ${({ theme, $variant }) =>
      $variant === 'primary' ? (theme.colors.brand.primaryHover ?? theme.colors.brand.primary)
    : $variant === 'danger'  ? '#fef2f2'
    :                          theme.colors.background.secondary};
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const InlineError = styled.div`
  margin-top: 6px;
  font-size: 12px;
  color: #b91c1c;
`;

interface Props {
  value: number | null;
  onChange: (groupId: number | null) => void;
  groups: PeopleGroup[];
  onGroupCreated: (group: PeopleGroup) => void;
}

export function GroupPicker({ value, onChange, groups, onGroupCreated }: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCreate = () => {
    setName('');
    setError(null);
    setCreating(true);
  };

  const cancel = () => {
    setCreating(false);
    setError(null);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await peopleGroupsApi.create({ name: trimmed });
      onGroupCreated(created);
      onChange(created.id);
      setCreating(false);
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create group');
    } finally {
      setSaving(false);
    }
  };

  // Allow Enter to submit and Escape to cancel inside the quick-create field
  // without firing the surrounding form's submit handler or any outer popover's
  // Escape-to-close listener.
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  };

  if (creating) {
    return (
      <>
        <Row>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New group name"
            onKeyDown={onKeyDown}
            autoFocus
            maxLength={255}
          />
          <SquareButton
            type="button"
            $variant="primary"
            onClick={save}
            disabled={saving}
            title="Create group"
          >
            <IconCheck size={16} />
          </SquareButton>
          <SquareButton
            type="button"
            onClick={cancel}
            disabled={saving}
            title="Cancel"
          >
            <IconX size={16} />
          </SquareButton>
        </Row>
        {error && <InlineError>{error}</InlineError>}
      </>
    );
  }

  return (
    <Row>
      <Select
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      >
        <option value="">No group</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </Select>
      <SquareButton type="button" onClick={startCreate} title="Create a new group">
        <IconPlus size={16} />
      </SquareButton>
    </Row>
  );
}

export default GroupPicker;
