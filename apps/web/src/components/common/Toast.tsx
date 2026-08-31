import React, { useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X, LucideIcon } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  /** Toast message content */
  message: string;
  /** Type of toast - determines styling and icon */
  type?: ToastType;
  /** Callback when toast is closed */
  onClose: () => void;
  /** Duration in ms before auto-close (0 for no auto-close) */
  duration?: number;
}

interface ToastConfig {
  bg: string;
  border: string;
  text: string;
  icon: LucideIcon;
  iconColor: string;
}

const Toast: React.FC<ToastProps> = ({ message, type = 'success', onClose, duration = 3000 }) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const types: Record<ToastType, ToastConfig> = {
    success: {
      bg: 'bg-green-50',
      border: 'border-green-500',
      text: 'text-green-800',
      icon: CheckCircle,
      iconColor: 'text-green-500',
    },
    error: {
      bg: 'bg-red-50',
      border: 'border-red-500',
      text: 'text-red-800',
      icon: XCircle,
      iconColor: 'text-red-500',
    },
    warning: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-500',
      text: 'text-yellow-800',
      icon: AlertCircle,
      iconColor: 'text-yellow-500',
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-500',
      text: 'text-blue-800',
      icon: Info,
      iconColor: 'text-blue-500',
    },
  };

  const config = types[type];
  const Icon = config.icon;

  return (
    <div
      className={`${config.bg} ${config.border} border-l-4 rounded-lg shadow-lg p-4 flex items-start max-w-md animate-slide-in`}
    >
      <Icon className={`${config.iconColor} h-5 w-5 mr-3 flex-shrink-0 mt-0.5`} />
      <div className={`flex-1 ${config.text} text-sm font-medium`}>{message}</div>
      <button
        onClick={onClose}
        className={`${config.text} hover:opacity-70 ml-2 flex-shrink-0`}
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
};

export default Toast;
