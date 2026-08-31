/**
 * useToast Hook
 * Toast notification management
 */

import { useState, useCallback } from 'react';
import type { ToastData } from '../components/ui/feedback/Toast';

export interface UseToastReturn {
  /** Active toasts */
  toasts: ToastData[];
  /** Show a toast */
  toast: (options: Omit<ToastData, 'id'>) => string;
  /** Show success toast */
  success: (message: string, title?: string) => string;
  /** Show error toast */
  error: (message: string, title?: string) => string;
  /** Show warning toast */
  warning: (message: string, title?: string) => string;
  /** Show info toast */
  info: (message: string, title?: string) => string;
  /** Dismiss a toast */
  dismiss: (id: string) => void;
  /** Dismiss all toasts */
  dismissAll: () => void;
}

let toastId = 0;

const generateId = (): string => {
  toastId += 1;
  return `toast-${toastId}`;
};

/**
 * Hook for managing toast notifications
 *
 * @example
 * ```tsx
 * const { toast, success, error, toasts, dismiss } = useToast();
 *
 * // Show custom toast
 * toast({ variant: 'info', message: 'Hello', title: 'Welcome' });
 *
 * // Shorthand methods
 * success('Item saved successfully');
 * error('Failed to save item');
 *
 * // Render toasts
 * <ToastContainer toasts={toasts} onClose={dismiss} />
 * ```
 */
export function useToast(): UseToastReturn {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const toast = useCallback((options: Omit<ToastData, 'id'>): string => {
    const id = generateId();
    const newToast: ToastData = {
      id,
      duration: 5000,
      ...options,
    };

    setToasts((prev) => [...prev, newToast]);
    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const success = useCallback(
    (message: string, title?: string): string => {
      return toast({ variant: 'success', message, title });
    },
    [toast]
  );

  const error = useCallback(
    (message: string, title?: string): string => {
      return toast({ variant: 'error', message, title, duration: 8000 });
    },
    [toast]
  );

  const warning = useCallback(
    (message: string, title?: string): string => {
      return toast({ variant: 'warning', message, title });
    },
    [toast]
  );

  const info = useCallback(
    (message: string, title?: string): string => {
      return toast({ variant: 'info', message, title });
    },
    [toast]
  );

  return {
    toasts,
    toast,
    success,
    error,
    warning,
    info,
    dismiss,
    dismissAll,
  };
}

export default useToast;
