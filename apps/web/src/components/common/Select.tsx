import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

export type SelectOptionInput = SelectOption | string;

export interface SelectProps {
  /** Label text for the select */
  label?: string;
  /** Name attribute for the select */
  name?: string;
  /** Current selected value */
  value?: string;
  /** Change handler */
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  /** Array of options: [{value, label}] or ['string', 'string'] */
  options?: SelectOptionInput[];
  /** Placeholder text for empty selection */
  placeholder?: string;
  /** Error message to display */
  error?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Whether the select is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

const Select: React.FC<SelectProps> = ({
  label,
  name,
  value,
  onChange,
  options = [],
  placeholder = 'Select an option',
  error,
  required = false,
  disabled = false,
  className = '',
}) => {
  // Normalize options to {value, label} format
  const normalizedOptions: SelectOption[] = options.map((opt) => {
    if (typeof opt === 'string') {
      return { value: opt, label: opt };
    }
    return opt;
  });

  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label
          htmlFor={name}
          className="block text-sm font-medium mb-1"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          className={`
            appearance-none w-full px-3 py-2 pr-10 rounded-lg border transition-colors
            focus:outline-none focus:ring-2 focus:ring-offset-0
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-red-500 focus:ring-red-500' : 'focus:ring-blue-500'}
          `}
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: error ? undefined : 'var(--color-border-primary)',
            color: 'var(--color-text-primary)',
          }}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {normalizedOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
          <ChevronDown
            className="h-4 w-4"
            style={{ color: 'var(--color-text-secondary)' }}
          />
        </div>
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
};

export default Select;
