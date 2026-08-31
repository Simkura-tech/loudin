import React from 'react';

export type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';
export type BadgeSize = 'small' | 'medium' | 'large';

export interface StatusBadgeProps {
  /** The status value (used for styling if no variant provided) */
  status?: string;
  /** Color variant */
  variant?: StatusVariant;
  /** Display text (defaults to formatted status) */
  label?: string;
  /** Optional icon character to display */
  icon?: string;
  /** Size variant */
  size?: BadgeSize;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  variant,
  label,
  icon,
  size = 'medium',
}) => {
  // Map common status values to variants
  const getVariantFromStatus = (status?: string): StatusVariant => {
    const statusVariants: Record<string, StatusVariant> = {
      active: 'success',
      enabled: 'success',
      online: 'success',
      connected: 'success',
      paid: 'success',
      inactive: 'neutral',
      disabled: 'neutral',
      offline: 'neutral',
      pending: 'warning',
      expiring: 'warning',
      warning: 'warning',
      expired: 'error',
      revoked: 'error',
      failed: 'error',
      error: 'error',
      cancelled: 'error',
      disconnected: 'error',
      info: 'info',
    };
    return statusVariants[status?.toLowerCase() || ''] || 'neutral';
  };

  const variantStyles: Record<StatusVariant, React.CSSProperties> = {
    success: {
      backgroundColor: 'var(--color-success-bg, #dcfce7)',
      color: 'var(--color-success, #16a34a)',
    },
    warning: {
      backgroundColor: 'var(--color-warning-bg, #fef3c7)',
      color: 'var(--color-warning, #d97706)',
    },
    error: {
      backgroundColor: 'var(--color-error-bg, #fee2e2)',
      color: 'var(--color-error, #dc2626)',
    },
    info: {
      backgroundColor: 'var(--color-info-bg, #dbeafe)',
      color: 'var(--color-info, #2563eb)',
    },
    neutral: {
      backgroundColor: 'var(--color-bg-tertiary, #f3f4f6)',
      color: 'var(--color-text-secondary, #6b7280)',
    },
  };

  const sizeClasses: Record<BadgeSize, string> = {
    small: 'px-1.5 py-0.5 text-xs',
    medium: 'px-2.5 py-0.5 text-xs',
    large: 'px-3 py-1 text-sm',
  };

  // Format status for display if no label provided
  const formatStatus = (status?: string): string => {
    if (!status) return 'Unknown';
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  };

  const resolvedVariant = variant || getVariantFromStatus(status);
  const displayLabel = label || formatStatus(status);

  return (
    <span
      className={`inline-flex items-center ${sizeClasses[size]} rounded-full font-medium`}
      style={variantStyles[resolvedVariant]}
    >
      {icon && <span className="mr-1">{icon}</span>}
      {displayLabel}
    </span>
  );
};

export default StatusBadge;
