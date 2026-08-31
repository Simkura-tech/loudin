/**
 * TextArea Component
 * Multi-line text input
 */

import React from 'react';
import styled from '@emotion/styled';
import { Label } from '../typography/Label';
import { Caption } from '../typography/Caption';
import { Stack } from '../primitives/Stack';
import { Row } from '../primitives/Row';
import { Text } from '../primitives/Text';

export interface TextAreaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {
  /** Label */
  label?: string;
  /** Helper text */
  helperText?: string;
  /** Error message */
  error?: string;
  /** Full width */
  fullWidth?: boolean;
  /** Required field */
  required?: boolean;
  /** Show character count */
  showCount?: boolean;
  /** Resize behavior */
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
}

const TextAreaWrapper = styled.div<{ fullWidth?: boolean }>`
  width: ${({ fullWidth }) => (fullWidth ? '100%' : 'auto')};
`;

const StyledTextArea = styled.textarea<{
  hasError?: boolean;
  resize?: string;
}>`
  width: 100%;
  min-height: 80px;
  padding: ${({ theme }) => theme.spacing[3]};
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme, hasError }) =>
    hasError ? theme.colors.status.error : theme.colors.border.primary};
  border-radius: ${({ theme }) => theme.borders.radius.md};
  font-family: ${({ theme }) => theme.typography.fontFamily.primary};
  font-size: ${({ theme }) => theme.typography.fontSize.md};
  color: ${({ theme }) => theme.colors.text.primary};
  line-height: ${({ theme }) => theme.typography.lineHeight.normal};
  resize: ${({ resize }) => resize || 'vertical'};
  transition: ${({ theme }) => theme.animations.transition.all};

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }

  &:hover:not(:disabled) {
    border-color: ${({ theme, hasError }) =>
      hasError ? theme.colors.status.error : theme.colors.border.secondary};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme, hasError }) =>
      hasError ? theme.colors.status.error : theme.colors.border.focus};
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.interactive.disabled};
    color: ${({ theme }) => theme.colors.text.disabled};
    cursor: not-allowed;
  }
`;

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  (
    {
      label,
      helperText,
      error,
      fullWidth,
      required,
      showCount,
      maxLength,
      resize = 'vertical',
      id,
      value,
      ...props
    },
    ref
  ) => {
    const textAreaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;

    const currentLength = typeof value === 'string' ? value.length : 0;

    return (
      <TextAreaWrapper fullWidth={fullWidth}>
        <Stack gap={1}>
          {label && (
            <Label htmlFor={textAreaId} required={required}>
              {label}
            </Label>
          )}
          <StyledTextArea
            ref={ref}
            id={textAreaId}
            value={value}
            maxLength={maxLength}
            hasError={!!error}
            resize={resize}
            required={required}
            {...props}
          />
          <Row justify="space-between">
            {(error || helperText) && (
              <Caption color={error ? 'error' : 'secondary'}>
                {error || helperText}
              </Caption>
            )}
            {showCount && maxLength && (
              <Text
                variant="caption"
                color={currentLength >= maxLength ? 'error' : 'tertiary'}
              >
                {currentLength}/{maxLength}
              </Text>
            )}
          </Row>
        </Stack>
      </TextAreaWrapper>
    );
  }
);

TextArea.displayName = 'TextArea';

export default TextArea;
