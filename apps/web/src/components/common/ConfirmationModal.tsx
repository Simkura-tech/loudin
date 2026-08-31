import React, { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Alert from './Alert';
import { AlertTriangle, Trash2, HelpCircle, LucideIcon } from 'lucide-react';
import type { ButtonVariant } from './Button';

export type ConfirmationVariant = 'danger' | 'warning' | 'info';

export interface ConfirmationModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Async callback when action is confirmed */
  onConfirm: () => Promise<void>;
  /** Modal title */
  title?: string;
  /** Main message to display */
  message?: string;
  /** Optional secondary description */
  description?: string;
  /** Text for confirm button */
  confirmText?: string;
  /** Text for cancel button */
  cancelText?: string;
  /** Style variant */
  variant?: ConfirmationVariant;
  /** Optional additional content (e.g., warnings, stats) */
  children?: React.ReactNode;
}

interface VariantConfig {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  buttonVariant: ButtonVariant;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  children,
}) => {
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const variantConfig: Record<ConfirmationVariant, VariantConfig> = {
    danger: {
      icon: Trash2,
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      buttonVariant: 'danger',
    },
    warning: {
      icon: AlertTriangle,
      iconBg: 'bg-yellow-100',
      iconColor: 'text-yellow-600',
      buttonVariant: 'danger',
    },
    info: {
      icon: HelpCircle,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      buttonVariant: 'primary',
    },
  };

  const config = variantConfig[variant] || variantConfig.danger;
  const Icon = config.icon;

  const handleConfirm = async (): Promise<void> => {
    setLoading(true);
    setError('');

    try {
      await onConfirm();
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (): void => {
    setError('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="small">
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      {/* Icon */}
      <div className="flex items-center justify-center mb-4">
        <div className={`${config.iconBg} rounded-full p-3`}>
          <Icon className={`h-8 w-8 ${config.iconColor}`} />
        </div>
      </div>

      {/* Message */}
      <div className="text-center mb-6">
        <h4
          className="text-lg font-semibold mb-2"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {message}
        </h4>
        {description && (
          <p style={{ color: 'var(--color-text-secondary)' }}>{description}</p>
        )}
      </div>

      {/* Additional Content */}
      {children && <div className="mb-6">{children}</div>}

      {/* Action Buttons */}
      <div className="flex justify-end space-x-3">
        <Button
          type="button"
          variant="secondary"
          onClick={handleClose}
          disabled={loading}
        >
          {cancelText}
        </Button>
        <Button
          type="button"
          variant={config.buttonVariant}
          onClick={handleConfirm}
          disabled={loading}
        >
          {loading ? 'Processing...' : confirmText}
        </Button>
      </div>
    </Modal>
  );
};

export default ConfirmationModal;
