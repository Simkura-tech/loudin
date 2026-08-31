/**
 * ProgressBar Component
 * Progress indicator with percentage
 */

import React from 'react';
import styled from '@emotion/styled';
import { css } from '@emotion/react';
import { motion } from 'framer-motion';
import type { Theme } from '../../../theme';
import { Text } from '../primitives/Text';
import { Row } from '../primitives/Row';

export type ProgressVariant = 'default' | 'success' | 'warning' | 'error';
export type ProgressSize = 'sm' | 'md' | 'lg';

export interface ProgressBarProps {
  /** Current value (0-100) */
  value: number;
  /** Maximum value */
  max?: number;
  /** Progress variant */
  variant?: ProgressVariant;
  /** Size */
  size?: ProgressSize;
  /** Show percentage label */
  showLabel?: boolean;
  /** Label position */
  labelPosition?: 'top' | 'right' | 'inside';
  /** Animated */
  animated?: boolean;
  /** Striped pattern */
  striped?: boolean;
  /** Custom label */
  label?: string;
}

const sizeMap: Record<ProgressSize, string> = {
  sm: '4px',
  md: '8px',
  lg: '12px',
};

const variantColors = {
  default: (theme: Theme) => theme.colors.brand.primary,
  success: (theme: Theme) => theme.colors.status.success,
  warning: (theme: Theme) => theme.colors.status.warning,
  error: (theme: Theme) => theme.colors.status.error,
};

const ProgressWrapper = styled.div<{ labelPosition: string }>`
  display: flex;
  flex-direction: ${({ labelPosition }) =>
    labelPosition === 'top' ? 'column' : 'row'};
  gap: ${({ theme, labelPosition }) =>
    labelPosition === 'top' ? theme.spacing[1] : theme.spacing[2]};
  align-items: ${({ labelPosition }) =>
    labelPosition === 'top' ? 'stretch' : 'center'};
  width: 100%;
`;

const TrackContainer = styled.div`
  flex: 1;
  position: relative;
`;

const Track = styled.div<{ size: ProgressSize }>`
  width: 100%;
  height: ${({ size }) => sizeMap[size]};
  background: ${({ theme }) => theme.colors.border.secondary};
  border-radius: ${({ theme }) => theme.borders.radius.full};
  overflow: hidden;
`;

const Fill = styled(motion.div)<{
  variant: ProgressVariant;
  size: ProgressSize;
  striped?: boolean;
}>`
  height: 100%;
  background: ${({ theme, variant }) => variantColors[variant](theme)};
  border-radius: ${({ theme }) => theme.borders.radius.full};
  transition: width 0.3s ease-out;

  ${({ striped }) =>
    striped &&
    css`
      background-image: linear-gradient(
        45deg,
        rgba(255, 255, 255, 0.15) 25%,
        transparent 25%,
        transparent 50%,
        rgba(255, 255, 255, 0.15) 50%,
        rgba(255, 255, 255, 0.15) 75%,
        transparent 75%,
        transparent
      );
      background-size: 1rem 1rem;
      animation: stripes 1s linear infinite;

      @keyframes stripes {
        from {
          background-position: 1rem 0;
        }
        to {
          background-position: 0 0;
        }
      }
    `}
`;

const InsideLabel = styled.span<{ size: ProgressSize }>`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.text.primary};
  display: ${({ size }) => (size === 'sm' ? 'none' : 'block')};
`;

const TopLabel = styled(Row)`
  justify-content: space-between;
`;

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  variant = 'default',
  size = 'md',
  showLabel = false,
  labelPosition = 'right',
  animated = true,
  striped = false,
  label,
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const displayLabel = label || `${Math.round(percentage)}%`;

  return (
    <ProgressWrapper labelPosition={labelPosition}>
      {showLabel && labelPosition === 'top' && (
        <TopLabel>
          <Text variant="body-sm" color="secondary">
            Progress
          </Text>
          <Text variant="body-sm" weight="medium">
            {displayLabel}
          </Text>
        </TopLabel>
      )}
      <TrackContainer>
        <Track size={size}>
          <Fill
            variant={variant}
            size={size}
            striped={striped}
            initial={animated ? { width: 0 } : false}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </Track>
        {showLabel && labelPosition === 'inside' && (
          <InsideLabel size={size}>{displayLabel}</InsideLabel>
        )}
      </TrackContainer>
      {showLabel && labelPosition === 'right' && (
        <Text variant="body-sm" weight="medium" style={{ minWidth: '40px' }}>
          {displayLabel}
        </Text>
      )}
    </ProgressWrapper>
  );
};

export default ProgressBar;
