/**
 * Button Component
 * Primary action button with variants and sizes
 */

import React from 'react';
import styled from '@emotion/styled';
import { css } from '@emotion/react';
import { motion } from 'framer-motion';
import type { Theme } from '../../../theme';
import { Icon, type IconProps } from '../Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onDrag' | 'onDragEnd' | 'onDragStart' | 'onDragEnter' | 'onDragExit' | 'onDragLeave' | 'onDragOver'> {
  /** Button variant */
  variant?: ButtonVariant;
  /** Button size */
  size?: ButtonSize;
  /** Icon to display before text */
  leftIcon?: IconProps['icon'];
  /** Icon to display after text */
  rightIcon?: IconProps['icon'];
  /** Full width button */
  fullWidth?: boolean;
  /** Loading state */
  loading?: boolean;
  /** As link */
  as?: 'button' | 'a';
  /** Link href (when as="a") */
  href?: string;
}

const sizeStyles = {
  sm: (theme: Theme) => css`
    height: ${theme.componentSpacing.inputHeightSm};
    padding: 0 ${theme.spacing[3]};
    font-size: ${theme.typography.fontSize.sm};
    gap: ${theme.spacing[1]};
  `,
  md: (theme: Theme) => css`
    height: ${theme.componentSpacing.inputHeightMd};
    padding: 0 ${theme.spacing[4]};
    font-size: ${theme.typography.fontSize.md};
    gap: ${theme.spacing[1.5]};
  `,
  lg: (theme: Theme) => css`
    height: ${theme.componentSpacing.inputHeightLg};
    padding: 0 ${theme.spacing[5]};
    font-size: ${theme.typography.fontSize.lg};
    gap: ${theme.spacing[2]};
  `,
};

const variantStyles = {
  primary: (theme: Theme) => css`
    background: ${theme.colors.brand.primary};
    color: ${theme.colors.text.inverse};
    border: none;

    &:hover:not(:disabled) {
      background: ${theme.colors.brand.primaryHover};
    }

    &:active:not(:disabled) {
      background: ${theme.colors.brand.primaryActive};
    }
  `,
  secondary: (theme: Theme) => css`
    background: ${theme.colors.background.secondary};
    color: ${theme.colors.text.primary};
    border: 1px solid ${theme.colors.border.primary};

    &:hover:not(:disabled) {
      background: ${theme.colors.interactive.hover};
      border-color: ${theme.colors.border.secondary};
    }

    &:active:not(:disabled) {
      background: ${theme.colors.interactive.active};
    }
  `,
  tertiary: (theme: Theme) => css`
    background: transparent;
    color: ${theme.colors.brand.primary};
    border: none;

    &:hover:not(:disabled) {
      background: ${theme.colors.brand.secondary};
    }

    &:active:not(:disabled) {
      background: ${theme.colors.interactive.selected};
    }
  `,
  danger: (theme: Theme) => css`
    background: ${theme.colors.status.error};
    color: ${theme.colors.text.inverse};
    border: none;

    &:hover:not(:disabled) {
      background: ${theme.colors.red[70]};
    }

    &:active:not(:disabled) {
      background: ${theme.colors.red[80]};
    }
  `,
  ghost: (theme: Theme) => css`
    background: transparent;
    color: ${theme.colors.text.secondary};
    border: none;

    &:hover:not(:disabled) {
      background: ${theme.colors.interactive.hover};
      color: ${theme.colors.text.primary};
    }

    &:active:not(:disabled) {
      background: ${theme.colors.interactive.active};
    }
  `,
};

const StyledButton = styled(motion.button)<{
  variant: ButtonVariant;
  size: ButtonSize;
  fullWidth?: boolean;
  $loading?: boolean;
}>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: ${({ theme }) => theme.typography.fontFamily.primary};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  border-radius: ${({ theme }) => theme.borders.radius.md};
  cursor: pointer;
  transition: ${({ theme }) => theme.animations.transition.all};
  user-select: none;
  white-space: nowrap;
  text-decoration: none;
  width: ${({ fullWidth }) => (fullWidth ? '100%' : 'auto')};

  ${({ theme, size }) => sizeStyles[size](theme)}
  ${({ theme, variant }) => variantStyles[variant](theme)}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.border.focus};
    outline-offset: 2px;
  }

  ${({ $loading }) =>
    $loading &&
    css`
      pointer-events: none;
      position: relative;
      color: transparent;
    `}
`;

const LoadingSpinner = styled(motion.span)`
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Spinner = styled.span<{ size: ButtonSize }>`
  width: ${({ size }) => (size === 'sm' ? '14px' : size === 'md' ? '16px' : '18px')};
  height: ${({ size }) => (size === 'sm' ? '14px' : size === 'md' ? '16px' : '18px')};
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      leftIcon,
      rightIcon,
      fullWidth,
      loading,
      disabled,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const iconSize = size === 'sm' ? 'sm' : size === 'md' ? 'md' : 'lg';

    return (
      <StyledButton
        ref={ref}
        type={type}
        variant={variant}
        size={size}
        fullWidth={fullWidth}
        $loading={loading}
        disabled={disabled || loading}
        {...({ whileTap: { scale: 0.98 } } as any)}
        {...(props as any)}
      >
        {loading && (
          <LoadingSpinner
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Spinner size={size} />
          </LoadingSpinner>
        )}
        {leftIcon && <Icon icon={leftIcon} size={iconSize} color="inherit" />}
        {children}
        {rightIcon && <Icon icon={rightIcon} size={iconSize} color="inherit" />}
      </StyledButton>
    );
  }
);

Button.displayName = 'Button';

export default Button;
