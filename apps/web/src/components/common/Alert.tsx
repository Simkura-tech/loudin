import React from 'react';
import { AlertCircle, CheckCircle, XCircle, Info, X, LucideIcon } from 'lucide-react';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

export interface AlertProps {
  /** Type of alert - determines styling and icon */
  type?: AlertType;
  /** Message content to display */
  message: React.ReactNode;
  /** Optional callback when alert is closed */
  onClose?: () => void;
}

interface AlertConfig {
  style: React.CSSProperties;
  icon: LucideIcon;
  iconStyle: React.CSSProperties;
}

const Alert: React.FC<AlertProps> = ({ type = 'info', message, onClose }) => {
  const types: Record<AlertType, AlertConfig> = {
    success: {
      style: {
        backgroundColor: 'var(--color-success-light)',
        borderColor: 'var(--color-success)',
        color: 'var(--color-success)',
      },
      icon: CheckCircle,
      iconStyle: { color: 'var(--color-success)' },
    },
    error: {
      style: {
        backgroundColor: 'var(--color-error-light)',
        borderColor: 'var(--color-error)',
        color: 'var(--color-error)',
      },
      icon: XCircle,
      iconStyle: { color: 'var(--color-error)' },
    },
    warning: {
      style: {
        backgroundColor: 'var(--color-warning-light)',
        borderColor: 'var(--color-warning)',
        color: 'var(--color-warning)',
      },
      icon: AlertCircle,
      iconStyle: { color: 'var(--color-warning)' },
    },
    info: {
      style: {
        backgroundColor: 'var(--color-info-light)',
        borderColor: 'var(--color-info)',
        color: 'var(--color-info)',
      },
      icon: Info,
      iconStyle: { color: 'var(--color-info)' },
    },
  };

  const config = types[type];
  const Icon = config.icon;

  return (
    <div className="border rounded-lg p-4 mb-4 flex items-start" style={config.style}>
      <Icon className="h-5 w-5 mr-3 flex-shrink-0 mt-0.5" style={config.iconStyle} />
      <div className="flex-1">{message}</div>
      {onClose && (
        <button onClick={onClose} className="hover:opacity-70 ml-2">
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
};

export default Alert;
