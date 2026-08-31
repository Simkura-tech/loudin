/**
 * Modal Component
 * Overlay dialog with Framer Motion animations
 */

import React, { useEffect } from 'react';
import styled from '@emotion/styled';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { IconX } from '@tabler/icons-react';
import { Text } from '../primitives/Text';
import { Icon } from '../Icon';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface ModalProps {
  /** Whether the modal is open */
  open?: boolean;
  /** Alias for open (backwards compatibility) */
  isOpen?: boolean;
  /** On close callback */
  onClose: () => void;
  /** Modal title */
  title?: string;
  /** Modal subtitle */
  subtitle?: string;
  /** Modal content */
  children: React.ReactNode;
  /** Modal size */
  size?: ModalSize;
  /** Footer content */
  footer?: React.ReactNode;
  /** Show close button */
  showCloseButton?: boolean;
  /** Close on backdrop click */
  closeOnBackdrop?: boolean;
  /** Close on escape key */
  closeOnEscape?: boolean;
}

const sizeMap: Record<ModalSize, string> = {
  sm: '400px',
  md: '520px',
  lg: '680px',
  xl: '900px',
  full: 'calc(100vw - 64px)',
};

const Backdrop = styled(motion.div)`
  position: fixed;
  inset: 0;
  background: ${({ theme }) => theme.colors.background.overlay};
  z-index: ${({ theme }) => theme.zIndex.modalBackdrop};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing[6]};
`;

const ModalContainer = styled(motion.div)<{ size: ModalSize }>`
  position: relative;
  width: 100%;
  max-width: ${({ size }) => sizeMap[size]};
  max-height: calc(100vh - 64px);
  background: ${({ theme }) => theme.colors.background.primary};
  border-radius: ${({ theme }) => theme.borders.radius.xl};
  box-shadow: ${({ theme }) => theme.shadows.modal};
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: ${({ theme }) => theme.zIndex.modal};
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing[5]};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.primary};
`;

const HeaderContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing[1]};
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: ${({ theme }) => theme.borders.radius.md};
  background: transparent;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text.secondary};
  transition: ${({ theme }) => theme.animations.transition.all};

  &:hover {
    background: ${({ theme }) => theme.colors.interactive.hover};
    color: ${({ theme }) => theme.colors.text.primary};
  }
`;

const ModalBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing[5]};
`;

const ModalFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing[2]};
  padding: ${({ theme }) => theme.spacing[4]} ${({ theme }) => theme.spacing[5]};
  border-top: 1px solid ${({ theme }) => theme.colors.border.primary};
`;

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 400, damping: 30 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 10,
    transition: { duration: 0.15 },
  },
};

export const Modal: React.FC<ModalProps> = ({
  open: openProp,
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  size = 'md',
  footer,
  showCloseButton = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
}) => {
  // Support both 'open' and 'isOpen' props
  const open = openProp ?? isOpen ?? false;

  // Handle escape key
  useEffect(() => {
    if (!closeOnEscape) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose, closeOnEscape]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose();
    }
  };

  const modal = (
    <AnimatePresence>
      {open && (
        <Backdrop
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={backdropVariants}
          transition={{ duration: 0.15 }}
          onClick={handleBackdropClick}
        >
          <ModalContainer
            size={size}
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'modal-title' : undefined}
          >
            {(title || showCloseButton) && (
              <ModalHeader>
                <HeaderContent>
                  {title && (
                    <Text id="modal-title" variant="h4" weight="semibold">
                      {title}
                    </Text>
                  )}
                  {subtitle && (
                    <Text variant="body-sm" color="secondary">
                      {subtitle}
                    </Text>
                  )}
                </HeaderContent>
                {showCloseButton && (
                  <CloseButton onClick={onClose} aria-label="Close modal">
                    <Icon icon={IconX} size="md" color="inherit" />
                  </CloseButton>
                )}
              </ModalHeader>
            )}
            <ModalBody>{children}</ModalBody>
            {footer && <ModalFooter>{footer}</ModalFooter>}
          </ModalContainer>
        </Backdrop>
      )}
    </AnimatePresence>
  );

  return createPortal(modal, document.body);
};

export default Modal;
