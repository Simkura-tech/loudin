/**
 * GroupMenu — menu-style picker for inline (popover) group assignment.
 *
 * Sibling to GroupPicker:
 *   - GroupPicker (form control)        — used inside form modals; native
 *                                         <select> + "+" button.
 *   - GroupMenu  (this file, popover)   — used inside floating popovers;
 *                                         renders the groups as clickable
 *                                         rows with a check on the current
 *                                         selection. Visually lighter.
 *
 * Same props as GroupPicker so the two are swappable.
 */

import { useState } from 'react';
import styled from '@emotion/styled';
import { IconCheck, IconPlus, IconX } from '@tabler/icons-react';
import { peopleGroupsApi, type PeopleGroup } from '../../services/access/peopleGroups';

const Wrap = styled.div`
  width: 240px;
  display: flex;
  flex-direction: column;
  font-size: 13px;
`;

const Caption = styled.div`
  padding: 6px 10px 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.text.tertiary};
`;

const ItemList = styled.div`
  max-height: 280px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 2px;
`;

const Item = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px 7px 10px;
  border-radius: 6px;
  border: none;
  background: ${({ theme, $active }) =>
    $active ? `${theme.colors.brand.primary}14` : 'transparent'};
  color: ${({ theme, $active }) =>
    $active ? theme.colors.brand.primary : theme.colors.text.primary};
  font: inherit;
  font-weight: ${({ $active }) => ($active ? 600 : 500)};
  cursor: pointer;
  text-align: left;
  width: 100%;

  &:hover {
    background: ${({ theme, $active }) =>
      $active ? `${theme.colors.brand.primary}1f` : theme.colors.background.secondary};
  }

  .check {
    width: 14px;
    flex-shrink: 0;
    color: ${({ theme }) => theme.colors.brand.primary};
    visibility: ${({ $active }) => ($active ? 'visible' : 'hidden')};
  }
  .label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .count {
    font-size: 11px;
    color: ${({ theme }) => theme.colors.text.tertiary};
    flex-shrink: 0;
  }
`;

const Divider = styled.div`
  height: 1px;
  background: ${({ theme }) => theme.colors.border.light};
  margin: 4px 6px;
`;

const CreateItem = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  margin: 2px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.brand.primary};
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  text-align: left;

  &:hover {
    background: ${({ theme }) => theme.colors.background.secondary};
  }
`;

const CreateRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
`;

const CreateInput = styled.input`
  flex: 1;
  height: 32px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  font-size: 13px;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.brand.primary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.brand.primary}26;
  }
`;

const MiniButton = styled.button<{ $variant?: 'primary' | 'default' }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid
    ${({ theme, $variant }) =>
      $variant === 'primary' ? theme.colors.brand.primary : theme.colors.border.light};
  background: ${({ theme, $variant }) =>
    $variant === 'primary' ? theme.colors.brand.primary : theme.colors.background.primary};
  color: ${({ theme, $variant }) =>
    $variant === 'primary' ? '#fff' : theme.colors.text.secondary};
  cursor: pointer;
  font-family: inherit;
  flex-shrink: 0;

  &:hover {
    background: ${({ theme, $variant }) =>
      $variant === 'primary'
        ? (theme.colors.brand.primaryHover ?? theme.colors.brand.primary)
        : theme.colors.background.secondary};
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const InlineError = styled.div`
  padding: 4px 10px 8px;
  font-size: 12px;
  color: #b91c1c;
`;

interface Props {
  value: number | null;
  onChange: (groupId: number | null) => void;
  groups: PeopleGroup[];
  onGroupCreated: (group: PeopleGroup) => void;
}

export function GroupMenu({ value, onChange, groups, onGroupCreated }: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create group');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Wrap>
      <Caption>Assign to group</Caption>

      <ItemList>
        <Item
          type="button"
          $active={value === null}
          onClick={() => onChange(null)}
        >
          <IconCheck size={14} className="check" />
          <span className="label">No group</span>
        </Item>
        {groups.map((g) => (
          <Item
            key={g.id}
            type="button"
            $active={value === g.id}
            onClick={() => onChange(g.id)}
          >
            <IconCheck size={14} className="check" />
            <span className="label">{g.name}</span>
            <span className="count">{g.member_count}</span>
          </Item>
        ))}
      </ItemList>

      <Divider />

      {creating ? (
        <>
          <CreateRow>
            <CreateInput
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New group name"
              maxLength={255}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  save();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setCreating(false);
                  setName('');
                  setError(null);
                }
              }}
            />
            <MiniButton type="button" $variant="primary" disabled={saving} onClick={save} title="Create">
              <IconCheck size={14} />
            </MiniButton>
            <MiniButton
              type="button"
              disabled={saving}
              onClick={() => { setCreating(false); setName(''); setError(null); }}
              title="Cancel"
            >
              <IconX size={14} />
            </MiniButton>
          </CreateRow>
          {error && <InlineError>{error}</InlineError>}
        </>
      ) : (
        <CreateItem type="button" onClick={() => { setCreating(true); setError(null); }}>
          <IconPlus size={14} />
          New group
        </CreateItem>
      )}
    </Wrap>
  );
}

export default GroupMenu;
