/**
 * Select Component
 * Dropdown select with search support
 */

import React, { useState, useRef, useEffect } from 'react';
import styled from '@emotion/styled';
import { css } from '@emotion/react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconChevronDown, IconCheck, IconSearch } from '@tabler/icons-react';
import type { Theme } from '../../../theme';
import { Icon } from '../Icon';
import { Label } from '../typography/Label';
import { Caption } from '../typography/Caption';
import { Stack } from '../primitives/Stack';
import { Text } from '../primitives/Text';

export type SelectSize = 'sm' | 'md' | 'lg';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  /** Options to display */
  options: SelectOption[];
  /** Selected value */
  value?: string | number;
  /** On change callback */
  onChange?: (value: string | number) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Label */
  label?: string;
  /** Helper text */
  helperText?: string;
  /** Error message */
  error?: string;
  /** Size */
  size?: SelectSize;
  /** Disabled state */
  disabled?: boolean;
  /** Required field */
  required?: boolean;
  /** Full width */
  fullWidth?: boolean;
  /** Searchable */
  searchable?: boolean;
  /** ID */
  id?: string;
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

const SelectWrapper = styled.div<{ fullWidth?: boolean }>`
  position: relative;
  width: ${({ fullWidth }) => (fullWidth ? '100%' : 'auto')};
`;

const SelectTrigger = styled.button<{
  size: SelectSize;
  hasError?: boolean;
  isOpen?: boolean;
  disabled?: boolean;
}>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme, hasError, isOpen }) =>
    hasError
      ? theme.colors.status.error
      : isOpen
      ? theme.colors.border.focus
      : theme.colors.border.primary};
  border-radius: ${({ theme }) => theme.borders.radius.md};
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  transition: ${({ theme }) => theme.animations.transition.all};
  font-family: ${({ theme }) => theme.typography.fontFamily.primary};
  text-align: left;

  ${({ theme, size }) => sizeStyles[size](theme)}

  ${({ disabled, theme }) =>
    disabled &&
    css`
      background: ${theme.colors.interactive.disabled};
      color: ${theme.colors.text.disabled};
    `}

  &:hover:not(:disabled) {
    border-color: ${({ theme, hasError }) =>
      hasError ? theme.colors.status.error : theme.colors.border.secondary};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.border.focus};
  }
`;

const TriggerContent = styled.span<{ isPlaceholder?: boolean }>`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({ theme, isPlaceholder }) =>
    isPlaceholder ? theme.colors.text.tertiary : theme.colors.text.primary};
`;

const ChevronIcon = styled(motion.span)`
  display: flex;
  margin-left: ${({ theme }) => theme.spacing[2]};
`;

const Dropdown = styled(motion.div)`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: ${({ theme }) => theme.zIndex.dropdown};
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.primary};
  border-radius: ${({ theme }) => theme.borders.radius.md};
  box-shadow: ${({ theme }) => theme.shadows.dropdown};
  max-height: 280px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const SearchContainer = styled.div`
  padding: ${({ theme }) => theme.spacing[2]};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.primary};
`;

const SearchInput = styled.input`
  width: 100%;
  padding: ${({ theme }) => `${theme.spacing[1.5]} ${theme.spacing[2]}`};
  padding-left: ${({ theme }) => theme.spacing[8]};
  background: ${({ theme }) => theme.colors.background.secondary};
  border: 1px solid ${({ theme }) => theme.colors.border.primary};
  border-radius: ${({ theme }) => theme.borders.radius.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-family: ${({ theme }) => theme.typography.fontFamily.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  outline: none;

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }

  &:focus {
    border-color: ${({ theme }) => theme.colors.border.focus};
  }
`;

const SearchInputWrapper = styled.div`
  position: relative;

  svg {
    position: absolute;
    left: ${({ theme }) => theme.spacing[2]};
    top: 50%;
    transform: translateY(-50%);
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
`;

const OptionsList = styled.div`
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing[1]} 0;
`;

const Option = styled.button<{ isSelected?: boolean; disabled?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: ${({ theme }) => `${theme.spacing[2]} ${theme.spacing[3]}`};
  background: ${({ theme, isSelected }) =>
    isSelected ? theme.colors.interactive.selected : 'transparent'};
  border: none;
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  font-family: ${({ theme }) => theme.typography.fontFamily.primary};
  font-size: ${({ theme }) => theme.typography.fontSize.md};
  color: ${({ theme, disabled }) =>
    disabled ? theme.colors.text.disabled : theme.colors.text.primary};
  text-align: left;
  transition: ${({ theme }) => theme.animations.transition.colors};

  &:hover:not(:disabled) {
    background: ${({ theme, isSelected }) =>
      isSelected ? theme.colors.interactive.selectedHover : theme.colors.interactive.hover};
  }
`;

const NoOptions = styled.div`
  padding: ${({ theme }) => theme.spacing[4]};
  text-align: center;
  color: ${({ theme }) => theme.colors.text.tertiary};
`;

export const Select: React.FC<SelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  label,
  helperText,
  error,
  size = 'md',
  disabled,
  required,
  fullWidth,
  searchable,
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search on open
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions = searchable
    ? options.filter((opt) =>
        opt.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : options;

  const handleSelect = (optionValue: string | number) => {
    onChange?.(optionValue);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <SelectWrapper fullWidth={fullWidth} ref={wrapperRef}>
      <Stack gap={1}>
        {label && (
          <Label htmlFor={selectId} required={required}>
            {label}
          </Label>
        )}
        <SelectTrigger
          id={selectId}
          type="button"
          size={size}
          hasError={!!error}
          isOpen={isOpen}
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <TriggerContent isPlaceholder={!selectedOption}>
            {selectedOption?.label || placeholder}
          </TriggerContent>
          <ChevronIcon
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <Icon icon={IconChevronDown} size="sm" color="secondary" />
          </ChevronIcon>
        </SelectTrigger>
        <AnimatePresence>
          {isOpen && (
            <Dropdown
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              role="listbox"
            >
              {searchable && (
                <SearchContainer>
                  <SearchInputWrapper>
                    <IconSearch size={14} />
                    <SearchInput
                      ref={searchInputRef}
                      type="text"
                      placeholder="Search..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </SearchInputWrapper>
                </SearchContainer>
              )}
              <OptionsList>
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((option) => (
                    <Option
                      key={option.value}
                      isSelected={option.value === value}
                      disabled={option.disabled}
                      onClick={() => !option.disabled && handleSelect(option.value)}
                      role="option"
                      aria-selected={option.value === value}
                    >
                      <Text variant="body-md">{option.label}</Text>
                      {option.value === value && (
                        <Icon icon={IconCheck} size="sm" color="brand" />
                      )}
                    </Option>
                  ))
                ) : (
                  <NoOptions>
                    <Text variant="body-sm" color="tertiary">
                      No options found
                    </Text>
                  </NoOptions>
                )}
              </OptionsList>
            </Dropdown>
          )}
        </AnimatePresence>
        {(error || helperText) && (
          <Caption color={error ? 'error' : 'secondary'}>
            {error || helperText}
          </Caption>
        )}
      </Stack>
    </SelectWrapper>
  );
};

export default Select;
