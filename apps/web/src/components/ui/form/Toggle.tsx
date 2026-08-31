/**
 * Toggle Component
 * Switch toggle with spring animation
 */

import React from 'react';
import styled from '@emotion/styled';
import { motion } from 'framer-motion';
import { Text } from '../primitives/Text';

export interface ToggleProps {
  /** Toggle checked state */
  checked?: boolean;
  /** On change callback */
  onChange?: (checked: boolean) => void;
  /** Label text */
  label?: string;
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
  /** Label position */
  labelPosition?: 'left' | 'right';
}

const ToggleWrapper = styled.label<{ disabled?: boolean; reverse?: boolean }>`
  display: inline-flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing[3]};
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
  flex-direction: ${({ reverse }) => (reverse ? 'row-reverse' : 'row')};
`;

const ToggleContainer = styled.div`
  flex-shrink: 0;
  display: flex;
  align-items: center;
  margin-top: 2px;
`;

const HiddenInput = styled.input`
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

const Track = styled(motion.div)<{
  checked?: boolean;
  size: 'sm' | 'md';
  disabled?: boolean;
}>`
  position: relative;
  width: ${({ size }) => (size === 'sm' ? '32px' : '40px')};
  height: ${({ size }) => (size === 'sm' ? '18px' : '22px')};
  background: ${({ theme, checked }) =>
    checked ? theme.colors.brand.primary : theme.colors.gray[30]};
  border-radius: ${({ theme }) => theme.borders.radius.full};
  transition: background-color ${({ theme }) => theme.animations.duration.normal}
    ${({ theme }) => theme.animations.easing.easeInOut};
`;

const Thumb = styled(motion.div)<{ size: 'sm' | 'md' }>`
  position: absolute;
  top: 2px;
  width: ${({ size }) => (size === 'sm' ? '14px' : '18px')};
  height: ${({ size }) => (size === 'sm' ? '14px' : '18px')};
  background: ${({ theme }) => theme.colors.background.primary};
  border-radius: ${({ theme }) => theme.borders.radius.full};
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const LabelContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing[0.5]};
`;

const thumbVariants = {
  sm: {
    checked: { x: 16 },
    unchecked: { x: 2 },
  },
  md: {
    checked: { x: 20 },
    unchecked: { x: 2 },
  },
};

export const Toggle: React.FC<ToggleProps> = ({
  checked = false,
  onChange,
  label,
  description,
  disabled,
  id,
  name,
  size = 'md',
  labelPosition = 'right',
}) => {
  const toggleId = id || `toggle-${Math.random().toString(36).substr(2, 9)}`;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!disabled && onChange) {
      onChange(e.target.checked);
    }
  };

  return (
    <ToggleWrapper disabled={disabled} reverse={labelPosition === 'left'}>
      <ToggleContainer>
        <HiddenInput
          type="checkbox"
          id={toggleId}
          name={name}
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
        />
        <Track checked={checked} size={size} disabled={disabled}>
          <Thumb
            size={size}
            initial={false}
            animate={checked ? 'checked' : 'unchecked'}
            variants={thumbVariants[size]}
            transition={{
              type: 'spring',
              stiffness: 500,
              damping: 30,
            }}
          />
        </Track>
      </ToggleContainer>
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
    </ToggleWrapper>
  );
};

export default Toggle;
