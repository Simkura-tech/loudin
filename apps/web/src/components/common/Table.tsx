import React from 'react';
import LoadingSpinner from './LoadingSpinner';

export interface TableColumn<T = Record<string, unknown>> {
  /** Unique key for the column */
  key: string;
  /** Header text */
  header: string;
  /** Custom render function for cell content */
  render?: (value: unknown, row: T) => React.ReactNode;
  /** Additional CSS classes for the column */
  className?: string;
  /** Whether the column is sortable */
  sortable?: boolean;
}

export interface TableProps<T = Record<string, unknown>> {
  /** Column definitions */
  columns?: TableColumn<T>[];
  /** Array of row data objects */
  data?: T[];
  /** Show loading spinner */
  loading?: boolean;
  /** Message when no data */
  emptyMessage?: string;
  /** Optional row click handler */
  onRowClick?: (row: T) => void;
  /** Key to use for row identification */
  rowKey?: string;
  /** Show striped rows */
  striped?: boolean;
  /** Show hover effect on rows */
  hoverable?: boolean;
  /** Additional CSS classes for table container */
  className?: string;
}

function Table<T extends Record<string, unknown> = Record<string, unknown>>({
  columns = [],
  data = [],
  loading = false,
  emptyMessage = 'No data available',
  onRowClick,
  rowKey = 'id',
  striped = false,
  hoverable = true,
  className = '',
}: TableProps<T>): React.ReactElement | null {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner text="Loading..." />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        className="text-center py-12"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {emptyMessage}
      </div>
    );
  }

  const handleMouseEnter = (e: React.MouseEvent<HTMLTableRowElement>): void => {
    if (hoverable) {
      e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)';
    }
  };

  const handleMouseLeave = (
    e: React.MouseEvent<HTMLTableRowElement>,
    rowIndex: number
  ): void => {
    if (hoverable) {
      e.currentTarget.style.backgroundColor =
        striped && rowIndex % 2 === 1
          ? 'var(--color-bg-tertiary)'
          : 'var(--color-bg-secondary)';
    }
  };

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="min-w-full divide-y" style={{ borderColor: 'var(--color-border-primary)' }}>
        <thead style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${column.className || ''}`}
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody
          className="divide-y"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border-primary)',
          }}
        >
          {data.map((row, rowIndex) => (
            <tr
              key={(row[rowKey] as string | number) ?? rowIndex}
              onClick={() => onRowClick && onRowClick(row)}
              className={`
                ${onRowClick ? 'cursor-pointer' : ''}
                ${hoverable ? 'transition-colors' : ''}
                ${striped && rowIndex % 2 === 1 ? 'bg-opacity-50' : ''}
              `}
              style={{
                ...(striped && rowIndex % 2 === 1
                  ? { backgroundColor: 'var(--color-bg-tertiary)' }
                  : {}),
              }}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={(e) => handleMouseLeave(e, rowIndex)}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-6 py-4 whitespace-nowrap text-sm ${column.className || ''}`}
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {column.render
                    ? column.render(row[column.key], row)
                    : (row[column.key] as React.ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Table;
