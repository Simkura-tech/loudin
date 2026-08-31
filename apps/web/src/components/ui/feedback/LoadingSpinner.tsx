/**
 * LoadingSpinner Component
 * Loading indicator with optional text
 */

import React from 'react';
import styled from '@emotion/styled';
import { motion } from 'framer-motion';
import { Text } from '../primitives/Text';
import { Stack } from '../primitives/Stack';

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'small' | 'medium' | 'large';

export interface LoadingSpinnerProps {
  /** Spinner size */
  size?: SpinnerSize;
  /** Loading text */
  text?: string;
  /** Center in container */
  center?: boolean;
  /** Full screen overlay */
  fullScreen?: boolean;
  /** Custom color */
  color?: string;
}

const sizeMap: Record<SpinnerSize, { size: number; border: number }> = {
  xs: { size: 14, border: 2 },
  sm: { size: 18, border: 2 },
  small: { size: 18, border: 2 },
  md: { size: 24, border: 3 },
  medium: { size: 24, border: 3 },
  lg: { size: 32, border: 3 },
  large: { size: 32, border: 3 },
  xl: { size: 48, border: 4 },
};

const SpinnerWrapper = styled.div<{ center?: boolean; fullScreen?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;

  ${({ center }) =>
    center &&
    `
    width: 100%;
    height: 100%;
    min-height: 120px;
  `}

  ${({ fullScreen, theme }) =>
    fullScreen &&
    `
    position: fixed;
    inset: 0;
    background: ${theme.colors.background.overlay};
    z-index: ${theme.zIndex.modal};
  `}
`;

const Spinner = styled(motion.div)<{
  spinnerSize: SpinnerSize;
  customColor?: string;
}>`
  width: ${({ spinnerSize }) => sizeMap[spinnerSize].size}px;
  height: ${({ spinnerSize }) => sizeMap[spinnerSize].size}px;
  border: ${({ spinnerSize }) => sizeMap[spinnerSize].border}px solid
    ${({ theme }) => theme.colors.border.secondary};
  border-top-color: ${({ theme, customColor }) =>
    customColor || theme.colors.brand.primary};
  border-radius: 50%;
`;

const spinTransition = {
  repeat: Infinity,
  duration: 0.75,
  ease: 'linear',
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  text,
  center = false,
  fullScreen = false,
  color,
}) => {
  return (
    <SpinnerWrapper center={center} fullScreen={fullScreen}>
      <Stack gap={3} align="center">
        <Spinner
          spinnerSize={size}
          customColor={color}
          animate={{ rotate: 360 }}
          transition={spinTransition}
        />
        {text && (
          <Text variant="body-sm" color="secondary">
            {text}
          </Text>
        )}
      </Stack>
    </SpinnerWrapper>
  );
};

export default LoadingSpinner;
