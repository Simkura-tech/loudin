/**
 * Table Component
 * Data table with sorting and selection
 */

import React, { useState, useMemo } from 'react';
import styled from '@emotion/styled';
import { IconChevronUp, IconChevronDown, IconSelector } from '@tabler/icons-react';
import { Checkbox } from '../form/Checkbox';
import { Text } from '../primitives/Text';
import { Row } from '../primitives/Row';
import { Icon } from '../Icon';

export interface TableColumn<T> {
  /** Column key */
  key: string;
  /** Column header */
  header: string;
  /** Cell renderer */
  render?: (row: T, index: number) => React.ReactNode;
  /** Sortable */
  sortable?: boolean;
  /** Column width */
  width?: string;
  /** Text alignment */
  align?: 'left' | 'center' | 'right';
}

export interface TableProps<T> {
  /** Table columns */
  columns: TableColumn<T>[];
  /** Table data */
  data: T[];
  /** Row key accessor */
  rowKey: keyof T | ((row: T) => string | number);
  /** Selectable rows */
  selectable?: boolean;
  /** Selected row keys */
  selectedKeys?: (string | number)[];
  /** On selection change */
  onSelectionChange?: (keys: (string | number)[]) => void;
  /** On row click */
  onRowClick?: (row: T) => void;
  /** Loading state */
  loading?: boolean;
  /** Empty message */
  emptyMessage?: string;
  /** Striped rows */
  striped?: boolean;
  /** Hover highlight */
  hoverable?: boolean;
  /** Compact size */
  compact?: boolean;
}

type SortDirection = 'asc' | 'desc' | null;

const TableWrapper = styled.div`
  width: 100%;
  overflow-x: auto;
  border: 1px solid ${({ theme }) => theme.colors.border.primary};
  border-radius: ${({ theme }) => theme.borders.radius.lg};
`;

const StyledTable = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const TableHead = styled.thead`
  background: ${({ theme }) => theme.colors.background.secondary};
`;

const TableHeadRow = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.primary};
`;

const TableHeadCell = styled.th<{
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  compact?: boolean;
}>`
  padding: ${({ theme, compact }) => (compact ? theme.spacing[2] : theme.spacing[3])};
  text-align: ${({ align }) => align || 'left'};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.text.secondary};
  white-space: nowrap;
  width: ${({ width }) => width};
  cursor: ${({ sortable }) => (sortable ? 'pointer' : 'default')};
  user-select: none;

  &:hover {
    ${({ sortable, theme }) =>
      sortable &&
      `
      color: ${theme.colors.text.primary};
    `}
  }
`;

const TableBody = styled.tbody``;

const TableRow = styled.tr<{
  clickable?: boolean;
  selected?: boolean;
  striped?: boolean;
  hoverable?: boolean;
}>`
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.primary};
  background: ${({ theme, selected, striped }) =>
    selected
      ? theme.colors.interactive.selected
      : striped
      ? theme.colors.background.secondary
      : theme.colors.background.primary};
  cursor: ${({ clickable }) => (clickable ? 'pointer' : 'default')};
  transition: ${({ theme }) => theme.animations.transition.colors};

  &:last-child {
    border-bottom: none;
  }

  ${({ hoverable, theme }) =>
    hoverable &&
    `
    &:hover {
      background: ${theme.colors.interactive.hover};
    }
  `}
`;

const TableCell = styled.td<{
  align?: 'left' | 'center' | 'right';
  compact?: boolean;
}>`
  padding: ${({ theme, compact }) => (compact ? theme.spacing[2] : theme.spacing[3])};
  text-align: ${({ align }) => align || 'left'};
  font-size: ${({ theme }) => theme.typography.fontSize.md};
  color: ${({ theme }) => theme.colors.text.primary};
`;

const EmptyState = styled.div`
  padding: ${({ theme }) => theme.spacing[10]};
  text-align: center;
`;

const SortIcon = styled.span`
  margin-left: ${({ theme }) => theme.spacing[1]};
  display: inline-flex;
  align-items: center;
`;

export function Table<T extends Record<string, any>>({
  columns,
  data,
  rowKey,
  selectable = false,
  selectedKeys = [],
  onSelectionChange,
  onRowClick,
  emptyMessage = 'No data available',
  striped = false,
  hoverable = true,
  compact = false,
}: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const getRowKey = (row: T): string | number => {
    if (typeof rowKey === 'function') {
      return rowKey(row);
    }
    return row[rowKey] as string | number;
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortKey(null);
        setSortDirection(null);
      }
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDirection) return data;

    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const comparison = aVal < bVal ? -1 : 1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortKey, sortDirection]);

  const allSelected =
    data.length > 0 && selectedKeys.length === data.length;
  const someSelected =
    selectedKeys.length > 0 && selectedKeys.length < data.length;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange?.(data.map((row) => getRowKey(row)));
    } else {
      onSelectionChange?.([]);
    }
  };

  const handleSelectRow = (row: T, checked: boolean) => {
    const key = getRowKey(row);
    if (checked) {
      onSelectionChange?.([...selectedKeys, key]);
    } else {
      onSelectionChange?.(selectedKeys.filter((k) => k !== key));
    }
  };

  const getSortIcon = (key: string) => {
    if (sortKey !== key) {
      return <Icon icon={IconSelector} size="sm" color="tertiary" />;
    }
    return sortDirection === 'asc' ? (
      <Icon icon={IconChevronUp} size="sm" color="brand" />
    ) : (
      <Icon icon={IconChevronDown} size="sm" color="brand" />
    );
  };

  return (
    <TableWrapper>
      <StyledTable>
        <TableHead>
          <TableHeadRow>
            {selectable && (
              <TableHeadCell width="40px" compact={compact}>
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={handleSelectAll}
                  size="sm"
                />
              </TableHeadCell>
            )}
            {columns.map((column) => (
              <TableHeadCell
                key={column.key}
                sortable={column.sortable}
                width={column.width}
                align={column.align}
                compact={compact}
                onClick={() => column.sortable && handleSort(column.key)}
              >
                <Row gap={1} justify={column.align === 'right' ? 'flex-end' : 'flex-start'}>
                  {column.header}
                  {column.sortable && (
                    <SortIcon>{getSortIcon(column.key)}</SortIcon>
                  )}
                </Row>
              </TableHeadCell>
            ))}
          </TableHeadRow>
        </TableHead>
        <TableBody>
          {sortedData.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)}>
                <EmptyState>
                  <Text variant="body-md" color="secondary">
                    {emptyMessage}
                  </Text>
                </EmptyState>
              </td>
            </tr>
          ) : (
            sortedData.map((row, index) => {
              const key = getRowKey(row);
              const isSelected = selectedKeys.includes(key);

              return (
                <TableRow
                  key={key}
                  clickable={!!onRowClick}
                  selected={isSelected}
                  striped={striped && index % 2 === 1}
                  hoverable={hoverable}
                  onClick={() => onRowClick?.(row)}
                >
                  {selectable && (
                    <TableCell compact={compact} onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onChange={(checked) => handleSelectRow(row, checked)}
                        size="sm"
                      />
                    </TableCell>
                  )}
                  {columns.map((column) => (
                    <TableCell key={column.key} align={column.align} compact={compact}>
                      {column.render
                        ? column.render(row, index)
                        : row[column.key]}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </StyledTable>
    </TableWrapper>
  );
}

export default Table;
