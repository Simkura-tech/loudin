/**
 * Checkbox Component
 * Checkbox with label and Framer Motion animation
 */

import React from 'react';
import styled from '@emotion/styled';
import { motion } from 'framer-motion';
import { IconCheck, IconMinus } from '@tabler/icons-react';
import { Text } from '../primitives/Text';

export interface CheckboxProps {
  /** Checkbox checked state */
  checked?: boolean;
  /** Indeterminate state */
  indeterminate?: boolean;
  /** On change callback */
  onChange?: (checked: boolean) => void;
  /** Label text or React node */
  label?: React.ReactNode;
  /** Description text */
  description?: string;
  /** Disabled state */
  disabled?: boolean;
  /** ID */
  id?: string;
  /** Name */
  name?: string;
  /** Size */
  size?: 'sm' | 'md';
  /** Rounded corners */
  rounded?: boolean;
}

const CheckboxWrapper = styled.label<{ disabled?: boolean }>`
  display: inline-flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing[2]};
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
`;

const CheckboxContainer = styled.div<{ size: 'sm' | 'md' }>`
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${({ size }) => (size === 'sm' ? '14px' : '16px')};
  height: ${({ size }) => (size === 'sm' ? '14px' : '16px')};
  margin-top: 2px;
`;

const HiddenCheckbox = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
`;

const StyledCheckbox = styled(motion.div)<{
  checked?: boolean;
  size: 'sm' | 'md';
  rounded?: boolean;
  disabled?: boolean;
}>`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme, checked }) =>
    checked ? theme.colors.brand.primary : theme.colors.background.primary};
  border: 1.5px solid ${({ theme, checked }) =>
    checked ? theme.colors.brand.primary : theme.colors.border.secondary};
  border-radius: ${({ theme, rounded }) =>
    rounded ? theme.borders.radius.full : theme.borders.radius.xs};
  transition: ${({ theme }) => theme.animations.transition.all};

  &:hover {
    border-color: ${({ theme, checked, disabled }) =>
      disabled
        ? undefined
        : checked
        ? theme.colors.brand.primaryHover
        : theme.colors.border.strong};
  }
`;

const IconWrapper = styled(motion.span)`
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.text.inverse};
`;

const LabelContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing[0.5]};
`;

const checkVariants = {
  checked: {
    pathLength: 1,
    opacity: 1,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
  unchecked: {
    pathLength: 0,
    opacity: 0,
    transition: { duration: 0.15, ease: 'easeIn' },
  },
};

export const Checkbox: React.FC<CheckboxProps> = ({
  checked = false,
  indeterminate = false,
  onChange,
  label,
  description,
  disabled,
  id,
  name,
  size = 'md',
  rounded = false,
}) => {
  const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!disabled && onChange) {
      onChange(e.target.checked);
    }
  };

  const iconSize = size === 'sm' ? 10 : 12;
  const Icon = indeterminate ? IconMinus : IconCheck;

  return (
    <CheckboxWrapper disabled={disabled}>
      <CheckboxContainer size={size}>
        <HiddenCheckbox
          type="checkbox"
          id={checkboxId}
          name={name}
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
        />
        <StyledCheckbox
          checked={checked || indeterminate}
          size={size}
          rounded={rounded}
          disabled={disabled}
          whileTap={disabled ? undefined : { scale: 0.9 }}
        >
          <IconWrapper
            initial={false}
            animate={checked || indeterminate ? 'checked' : 'unchecked'}
            variants={checkVariants}
          >
            <Icon size={iconSize} strokeWidth={3} />
          </IconWrapper>
        </StyledCheckbox>
      </CheckboxContainer>
      {(label || description) && (
        <LabelContent>
          {label && (
            <Text variant={size === 'sm' ? 'body-sm' : 'body-md'}>{label}</Text>
          )}
          {description && (
            <Text variant="caption" color="secondary">
              {description}
            </Text>
          )}
        </LabelContent>
      )}
    </CheckboxWrapper>
  );
};

export default Checkbox;
