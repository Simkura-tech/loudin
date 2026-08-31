/**
 * Badge Component
 * Status badge with color variants
 */

import React from 'react';
import styled from '@emotion/styled';
import { css } from '@emotion/react';
import type { Theme } from '../../../theme';
import { Icon, type IconProps } from '../Icon';

export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'error'
  | 'info';

export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps {
  /** Badge text */
  children: React.ReactNode;
  /** Badge variant */
  variant?: BadgeVariant;
  /** Badge size */
  size?: BadgeSize;
  /** Left icon */
  leftIcon?: IconProps['icon'];
  /** Pill shape (fully rounded) */
  pill?: boolean;
  /** Dot indicator instead of icon */
  dot?: boolean;
}

const variantStyles = {
  default: (theme: Theme) => css`
    background: ${theme.colors.gray[20]};
    color: ${theme.colors.text.secondary};
  `,
  primary: (theme: Theme) => css`
    background: ${theme.colors.brand.secondary};
    color: ${theme.colors.brand.primary};
  `,
  success: (theme: Theme) => css`
    background: ${theme.colors.status.successBackground};
    color: ${theme.colors.status.success};
  `,
  warning: (theme: Theme) => css`
    background: ${theme.colors.status.warningBackground};
    color: ${theme.colors.status.warning};
  `,
  error: (theme: Theme) => css`
    background: ${theme.colors.status.errorBackground};
    color: ${theme.colors.status.error};
  `,
  info: (theme: Theme) => css`
    background: ${theme.colors.status.infoBackground};
    color: ${theme.colors.status.info};
  `,
};

const sizeStyles = {
  sm: (theme: Theme) => css`
    padding: ${theme.spacing[0.5]} ${theme.spacing[1.5]};
    font-size: ${theme.typography.fontSize.xs};
    gap: ${theme.spacing[1]};
  `,
  md: (theme: Theme) => css`
    padding: ${theme.spacing[1]} ${theme.spacing[2]};
    font-size: ${theme.typography.fontSize.sm};
    gap: ${theme.spacing[1]};
  `,
  lg: (theme: Theme) => css`
    padding: ${theme.spacing[1.5]} ${theme.spacing[3]};
    font-size: ${theme.typography.fontSize.md};
    gap: ${theme.spacing[1.5]};
  `,
};

const StyledBadge = styled.span<{
  variant: BadgeVariant;
  size: BadgeSize;
  pill?: boolean;
}>`
  display: inline-flex;
  align-items: center;
  font-family: ${({ theme }) => theme.typography.fontFamily.primary};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  border-radius: ${({ theme, pill }) =>
    pill ? theme.borders.radius.full : theme.borders.radius.sm};
  white-space: nowrap;

  ${({ theme, variant }) => variantStyles[variant](theme)}
  ${({ theme, size }) => sizeStyles[size](theme)}
`;

const Dot = styled.span<{ variant: BadgeVariant }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
`;

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  leftIcon,
  pill = false,
  dot = false,
}) => {
  const iconSize = size === 'sm' ? 'xs' : size === 'md' ? 'sm' : 'md';

  return (
    <StyledBadge variant={variant} size={size} pill={pill}>
      {dot && <Dot variant={variant} />}
      {leftIcon && !dot && <Icon icon={leftIcon} size={iconSize} color="inherit" />}
      {children}
    </StyledBadge>
  );
};

export default Badge;
