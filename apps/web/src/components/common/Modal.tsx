import React from 'react';
import { X } from 'lucide-react';

export type ModalSize = 'small' | 'medium' | 'large' | 'xlarge';

export interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Modal title */
  title: string;
  /** Modal content */
  children: React.ReactNode;
  /** Size of the modal */
  size?: ModalSize;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'medium' }) => {
  if (!isOpen) return null;

  const sizes: Record<ModalSize, string> = {
    small: 'max-w-md',
    medium: 'max-w-lg',
    large: 'max-w-2xl',
    xlarge: 'max-w-4xl',
  };

  const handleBackdropClick = (): void => {
    onClose();
  };

  const handleModalClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleBackdropClick}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className={`relative rounded-lg shadow-xl ${sizes[size]} w-full`}
          style={{ backgroundColor: 'var(--color-bg-secondary)' }}
          onClick={handleModalClick}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between p-6 border-b"
            style={{ borderColor: 'var(--color-border-primary)' }}
          >
            <h3
              className="text-xl font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {title}
            </h3>
            <button
              onClick={onClose}
              className="transition-colors"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6">{children}</div>
        </div>
      </div>
    </div>
  );
};

export default Modal;
