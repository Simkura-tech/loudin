/**
 * Icon Component
 * Wrapper for Tabler icons with size and color support
 */

import React from 'react';
import styled from '@emotion/styled';
import { useTheme } from '@emotion/react';
import type { Theme } from '../../theme';

// Define TablerIconsProps since it's not exported from @tabler/icons-react
export interface TablerIconsProps {
  size?: number | string;
  color?: string;
  stroke?: number | string;
  className?: string;
}

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export type IconColor =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'disabled'
  | 'inverse'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'brand'
  | 'inherit';

export interface IconProps {
  /** The Tabler icon component */
  icon: React.FC<TablerIconsProps>;
  /** Icon size */
  size?: IconSize | number;
  /** Icon color */
  color?: IconColor | string;
  /** Stroke width */
  strokeWidth?: number;
  /** Additional class name */
  className?: string;
  /** On click handler */
  onClick?: () => void;
  /** Accessibility label */
  'aria-label'?: string;
}

const sizeMap: Record<IconSize, number> = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
};

const getColor = (color: IconColor | string, theme: Theme): string => {
  const colorMap: Record<string, string> = {
    primary: theme.colors.text.primary,
    secondary: theme.colors.text.secondary,
    tertiary: theme.colors.text.tertiary,
    disabled: theme.colors.text.disabled,
    inverse: theme.colors.text.inverse,
    success: theme.colors.status.success,
    warning: theme.colors.status.warning,
    error: theme.colors.status.error,
    info: theme.colors.status.info,
    brand: theme.colors.brand.primary,
    inherit: 'inherit',
  };

  return colorMap[color] || color;
};

const IconWrapper = styled.span<{ clickable?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  ${({ clickable }) =>
    clickable &&
    `
    cursor: pointer;
    transition: opacity 0.15s ease;

    &:hover {
      opacity: 0.8;
    }
  `}
`;

export const Icon: React.FC<IconProps> = ({
  icon: IconComponent,
  size = 'md',
  color = 'primary',
  strokeWidth = 1.5,
  className,
  onClick,
  'aria-label': ariaLabel,
}) => {
  const theme = useTheme();

  const pixelSize = typeof size === 'number' ? size : sizeMap[size];
  const resolvedColor = getColor(color, theme);

  return (
    <IconWrapper
      className={className}
      onClick={onClick}
      clickable={!!onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={ariaLabel}
    >
      <IconComponent
        size={pixelSize}
        color={resolvedColor}
        stroke={strokeWidth}
      />
    </IconWrapper>
  );
};

export default Icon;
