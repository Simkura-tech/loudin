/**
 * Alert Component
 * Contextual alert messages
 */

import React from 'react';
import styled from '@emotion/styled';
import { css } from '@emotion/react';
import { motion } from 'framer-motion';
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
import { Row } from '../primitives/Row';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps {
  /** Alert variant */
  variant?: AlertVariant;
  /** Alias for variant (legacy) */
  type?: AlertVariant;
  /** Alert title */
  title?: string;
  /** Alert message */
  children?: React.ReactNode;
  /** Message content (alias for children) */
  message?: React.ReactNode;
  /** Dismissible */
  dismissible?: boolean;
  /** On dismiss callback */
  onDismiss?: () => void;
  /** On close callback (alias for onDismiss) */
  onClose?: () => void;
  /** Custom icon */
  icon?: React.FC<any>;
  /** Actions */
  actions?: React.ReactNode;
  /** Custom className */
  className?: string;
}

const iconMap = {
  info: IconInfoCircle,
  success: IconCircleCheck,
  warning: IconAlertTriangle,
  error: IconAlertCircle,
};

const variantStyles = {
  info: (theme: Theme) => css`
    background: ${theme.colors.status.infoBackground};
    border-color: ${theme.colors.status.infoBorder};
    color: ${theme.colors.status.info};
  `,
  success: (theme: Theme) => css`
    background: ${theme.colors.status.successBackground};
    border-color: ${theme.colors.status.successBorder};
    color: ${theme.colors.status.success};
  `,
  warning: (theme: Theme) => css`
    background: ${theme.colors.status.warningBackground};
    border-color: ${theme.colors.status.warningBorder};
    color: ${theme.colors.status.warning};
  `,
  error: (theme: Theme) => css`
    background: ${theme.colors.status.errorBackground};
    border-color: ${theme.colors.status.errorBorder};
    color: ${theme.colors.status.error};
  `,
};

const AlertContainer = styled(motion.div)<{ variant: AlertVariant }>`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing[3]};
  padding: ${({ theme }) => theme.spacing[4]};
  border: 1px solid;
  border-radius: ${({ theme }) => theme.borders.radius.lg};

  ${({ theme, variant }) => variantStyles[variant](theme)}
`;

const IconWrapper = styled.span`
  flex-shrink: 0;
  display: flex;
  margin-top: 2px;
`;

const Content = styled.div`
  flex: 1;
  min-width: 0;
`;

const Title = styled(Text)`
  margin-bottom: ${({ theme }) => theme.spacing[1]};
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
  opacity: 0.6;
  transition: ${({ theme }) => theme.animations.transition.all};

  &:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.1);
  }
`;

const Actions = styled(Row)`
  margin-top: ${({ theme }) => theme.spacing[3]};
`;

const alertVariants = {
  hidden: { opacity: 0, y: -8, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.95 },
};

export const Alert: React.FC<AlertProps> = ({
  variant,
  type,
  title,
  children,
  message,
  dismissible = false,
  onDismiss,
  onClose,
  icon,
  actions,
  className,
}) => {
  const alertVariant = variant || type || 'info';
  const alertContent = children || message;
  const handleDismiss = onDismiss || onClose;
  const IconComponent = icon || iconMap[alertVariant];

  return (
    <AlertContainer
      variant={alertVariant}
      className={className}
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={alertVariants}
      transition={{ duration: 0.2 }}
    >
      <IconWrapper>
        <Icon icon={IconComponent} size="lg" color="inherit" />
      </IconWrapper>
      <Content>
        {title && (
          <Title variant="body-md" weight="semibold" color="inherit">
            {title}
          </Title>
        )}
        <Text variant="body-sm" color="inherit">
          {alertContent}
        </Text>
        {actions && <Actions gap={2}>{actions}</Actions>}
      </Content>
      {(dismissible || handleDismiss) && (
        <CloseButton onClick={handleDismiss} aria-label="Dismiss alert">
          <Icon icon={IconX} size="sm" color="inherit" />
        </CloseButton>
      )}
    </AlertContainer>
  );
};

export default Alert;
