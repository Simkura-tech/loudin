import React from 'react';
import Toast from './Toast';
import type { ToastType } from './Toast';

export interface ToastItem {
  id: string | number;
  message: string;
  type?: ToastType;
  duration?: number;
}

export interface ToastContainerProps {
  /** Array of toast items to display */
  toasts: ToastItem[];
  /** Callback to remove a toast by id */
  removeToast: (id: string | number) => void;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-20 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => removeToast(toast.id)}
          duration={toast.duration}
        />
      ))}
    </div>
  );
};

export default ToastContainer;
