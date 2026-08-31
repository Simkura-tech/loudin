/**
 * Input Component
 * Text input with variants and states
 */

import React, { useState } from 'react';
import styled from '@emotion/styled';
import { css } from '@emotion/react';
import { IconEye, IconEyeOff, IconSearch, IconX } from '@tabler/icons-react';
import type { Theme } from '../../../theme';
import { Icon, type IconProps } from '../Icon';
import { Label } from '../typography/Label';
import { Caption } from '../typography/Caption';
import { Stack } from '../primitives/Stack';

export type InputSize = 'sm' | 'md' | 'lg';
export type InputType = 'text' | 'password' | 'email' | 'number' | 'tel' | 'url' | 'search';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Input label */
  label?: string;
  /** Helper text below input */
  helperText?: string;
  /** Help text (alias for helperText) */
  helpText?: string;
  /** Error message */
  error?: string;
  /** Input size */
  size?: InputSize;
  /** Left icon */
  leftIcon?: IconProps['icon'];
  /** Icon (alias for leftIcon) */
  icon?: IconProps['icon'] | React.ReactNode;
  /** Right icon */
  rightIcon?: IconProps['icon'];
  /** Full width */
  fullWidth?: boolean;
  /** Show clear button */
  clearable?: boolean;
  /** On clear callback */
  onClear?: () => void;
  /** Required field */
  required?: boolean;
}

const sizeStyles = {
  sm: (theme: Theme) => css`
    height: ${theme.componentSpacing.inputHeightSm};
    padding: 0 ${theme.spacing[2]};
    font-size: ${theme.typography.fontSize.sm};
  `,
  md: (theme: Theme) => css`
    height: ${theme.componentSpacing.inputHeightMd};
    padding: 0 ${theme.spacing[3]};
    font-size: ${theme.typography.fontSize.md};
  `,
  lg: (theme: Theme) => css`
    height: ${theme.componentSpacing.inputHeightLg};
    padding: 0 ${theme.spacing[4]};
    font-size: ${theme.typography.fontSize.lg};
  `,
};

const InputWrapper = styled.div<{ fullWidth?: boolean }>`
  width: ${({ fullWidth }) => (fullWidth ? '100%' : 'auto')};
`;

const InputContainer = styled.div<{
  size: InputSize;
  hasError?: boolean;
  hasLeftIcon?: boolean;
  hasRightIcon?: boolean;
  focused?: boolean;
  disabled?: boolean;
}>`
  position: relative;
  display: flex;
  align-items: center;
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme, hasError, focused }) =>
    hasError
      ? theme.colors.status.error
      : focused
      ? theme.colors.border.focus
      : theme.colors.border.primary};
  border-radius: ${({ theme }) => theme.borders.radius.md};
  transition: ${({ theme }) => theme.animations.transition.all};

  ${({ theme, size }) => sizeStyles[size](theme)}

  ${({ hasLeftIcon, theme }) =>
    hasLeftIcon &&
    css`
      padding-left: ${theme.spacing[2]};
    `}

  ${({ hasRightIcon, theme }) =>
    hasRightIcon &&
    css`
      padding-right: ${theme.spacing[2]};
    `}

  ${({ disabled, theme }) =>
    disabled &&
    css`
      background: ${theme.colors.interactive.disabled};
      cursor: not-allowed;
    `}

  &:hover:not([disabled]) {
    border-color: ${({ theme, hasError }) =>
      hasError ? theme.colors.status.error : theme.colors.border.secondary};
  }
`;

const StyledInput = styled.input`
  flex: 1;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.primary};
  font-family: ${({ theme }) => theme.typography.fontFamily.primary};
  outline: none;
  width: 100%;
  height: 100%;

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }

  &:disabled {
    color: ${({ theme }) => theme.colors.text.disabled};
    cursor: not-allowed;
  }

  /* Hide number spinners */
  &[type='number']::-webkit-inner-spin-button,
  &[type='number']::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  &[type='number'] {
    -moz-appearance: textfield;
  }

  /* Hide search cancel button */
  &[type='search']::-webkit-search-cancel-button {
    -webkit-appearance: none;
  }
`;

const IconWrapper = styled.span<{ position: 'left' | 'right'; clickable?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  ${({ position, theme }) =>
    position === 'left'
      ? css`
          margin-right: ${theme.spacing[2]};
        `
      : css`
          margin-left: ${theme.spacing[2]};
        `}
  ${({ clickable }) =>
    clickable &&
    css`
      cursor: pointer;
    `}
`;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      helpText,
      error,
      size = 'md',
      type = 'text',
      leftIcon,
      icon,
      rightIcon,
      fullWidth,
      clearable,
      onClear,
      required,
      disabled,
      id,
      value,
      onChange,
      ...props
    },
    ref
  ) => {
    const effectiveHelperText = helperText || helpText;
    const effectiveLeftIconProp = leftIcon || (typeof icon === 'function' ? icon : undefined);
    const [focused, setFocused] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
    const isPassword = type === 'password';
    const isSearch = type === 'search';
    const hasValue = value !== undefined && value !== '';

    const handleClear = () => {
      if (onClear) {
        onClear();
      }
    };

    const iconSize = size === 'sm' ? 'sm' : 'md';

    // Determine right icon
    let effectiveRightIcon = rightIcon;
    let rightIconClickable = false;
    let rightIconOnClick: (() => void) | undefined;

    if (isPassword) {
      effectiveRightIcon = showPassword ? IconEyeOff : IconEye;
      rightIconClickable = true;
      rightIconOnClick = () => setShowPassword(!showPassword);
    } else if (clearable && hasValue) {
      effectiveRightIcon = IconX;
      rightIconClickable = true;
      rightIconOnClick = handleClear;
    }

    // Determine left icon
    const effectiveLeftIcon = isSearch && !effectiveLeftIconProp ? IconSearch : effectiveLeftIconProp;

    return (
      <InputWrapper fullWidth={fullWidth}>
        <Stack gap={1}>
          {label && (
            <Label htmlFor={inputId} required={required}>
              {label}
            </Label>
          )}
          <InputContainer
            size={size}
            hasError={!!error}
            hasLeftIcon={!!effectiveLeftIcon}
            hasRightIcon={!!effectiveRightIcon}
            focused={focused}
            disabled={disabled}
          >
            {effectiveLeftIcon && (
              <IconWrapper position="left">
                <Icon icon={effectiveLeftIcon} size={iconSize} color="tertiary" />
              </IconWrapper>
            )}
            <StyledInput
              ref={ref}
              id={inputId}
              type={isPassword && showPassword ? 'text' : type}
              value={value}
              onChange={onChange}
              disabled={disabled}
              required={required}
              onFocus={(e) => {
                setFocused(true);
                props.onFocus?.(e);
              }}
              onBlur={(e) => {
                setFocused(false);
                props.onBlur?.(e);
              }}
              {...props}
            />
            {effectiveRightIcon && (
              <IconWrapper
                position="right"
                clickable={rightIconClickable}
                onClick={rightIconOnClick}
              >
                <Icon
                  icon={effectiveRightIcon}
                  size={iconSize}
                  color="tertiary"
                />
              </IconWrapper>
            )}
          </InputContainer>
          {(error || effectiveHelperText) && (
            <Caption color={error ? 'error' : 'secondary'}>
              {error || effectiveHelperText}
            </Caption>
          )}
        </Stack>
      </InputWrapper>
    );
  }
);

Input.displayName = 'Input';

export default Input;
