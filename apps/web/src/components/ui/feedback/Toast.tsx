/**
 * Toast Component
 * Slide-in notification toasts
 */

import React, { useEffect, forwardRef } from 'react';
import styled from '@emotion/styled';
import { css } from '@emotion/react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
  IconInfoCircle,
  IconCircleCheck,
  IconAlertTriangle,
  IconAlertCircle,
  IconX,
} from '@tabler/icons-react';
import type { Theme } from '../../../theme';
import { Icon } from '../Icon';
import { Text } from '../primitives/Text';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';
export type ToastPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';

export interface ToastData {
  id: string;
  variant: ToastVariant;
  title?: string;
  message: string;
  duration?: number;
}

export interface ToastProps extends ToastData {
  onClose: (id: string) => void;
}

export interface ToastContainerProps {
  toasts: ToastData[];
  position?: ToastPosition;
  onClose: (id: string) => void;
}

const iconMap = {
  info: IconInfoCircle,
  success: IconCircleCheck,
  warning: IconAlertTriangle,
  error: IconAlertCircle,
};

const variantStyles = {
  info: (theme: Theme) => css`
    border-left-color: ${theme.colors.status.info};
  `,
  success: (theme: Theme) => css`
    border-left-color: ${theme.colors.status.success};
  `,
  warning: (theme: Theme) => css`
    border-left-color: ${theme.colors.status.warning};
  `,
  error: (theme: Theme) => css`
    border-left-color: ${theme.colors.status.error};
  `,
};

const iconColors: Record<ToastVariant, string> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
};

const ToastContainerWrapper = styled.div<{ position: ToastPosition }>`
  position: fixed;
  z-index: ${({ theme }) => theme.zIndex.toast};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing[2]};
  padding: ${({ theme }) => theme.spacing[4]};
  pointer-events: none;

  ${({ position }) => {
    switch (position) {
      case 'top-right':
        return css`
          top: 0;
          right: 0;
          align-items: flex-end;
        `;
      case 'top-left':
        return css`
          top: 0;
          left: 0;
          align-items: flex-start;
        `;
      case 'bottom-right':
        return css`
          bottom: 0;
          right: 0;
          align-items: flex-end;
        `;
      case 'bottom-left':
        return css`
          bottom: 0;
          left: 0;
          align-items: flex-start;
        `;
      case 'top-center':
        return css`
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          align-items: center;
        `;
      case 'bottom-center':
        return css`
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          align-items: center;
        `;
    }
  }}
`;

const ToastWrapper = styled(motion.div)<{ variant: ToastVariant }>`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing[3]};
  padding: ${({ theme }) => theme.spacing[3]} ${({ theme }) => theme.spacing[4]};
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.primary};
  border-left: 4px solid;
  border-radius: ${({ theme }) => theme.borders.radius.lg};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  min-width: 300px;
  max-width: 400px;
  pointer-events: auto;

  ${({ theme, variant }) => variantStyles[variant](theme)}
`;

const Content = styled.div`
  flex: 1;
  min-width: 0;
`;

const CloseButton = styled.button`
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: ${({ theme }) => theme.borders.radius.sm};
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text.tertiary};
  transition: ${({ theme }) => theme.animations.transition.all};

  &:hover {
    color: ${({ theme }) => theme.colors.text.primary};
    background: ${({ theme }) => theme.colors.interactive.hover};
  }
`;

const toastVariants = {
  initial: { opacity: 0, y: -20, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -20, scale: 0.95, transition: { duration: 0.15 } },
};

export const Toast = forwardRef<HTMLDivElement, ToastProps>(({
  id,
  variant,
  title,
  message,
  duration = 5000,
  onClose,
}, ref) => {
  const IconComponent = iconMap[variant];

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose(id);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [id, duration, onClose]);

  return (
    <ToastWrapper
      ref={ref}
      variant={variant}
      variants={toastVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      layout
    >
      <Icon icon={IconComponent} size="lg" color={iconColors[variant]} />
      <Content>
        {title && (
          <Text variant="body-sm" weight="semibold">
            {title}
          </Text>
        )}
        <Text variant="body-sm" color="secondary">
          {message}
        </Text>
      </Content>
      <CloseButton onClick={() => onClose(id)} aria-label="Close toast">
        <Icon icon={IconX} size="sm" color="inherit" />
      </CloseButton>
    </ToastWrapper>
  );
});

Toast.displayName = 'Toast';

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  position = 'top-right',
  onClose,
}) => {
  const container = (
    <ToastContainerWrapper position={position}>
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} onClose={onClose} />
        ))}
      </AnimatePresence>
    </ToastContainerWrapper>
  );

  return createPortal(container, document.body);
};

export default ToastContainer;
