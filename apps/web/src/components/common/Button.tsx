import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonType = 'button' | 'submit' | 'reset';

export interface ButtonProps {
  /** Button content */
  children: React.ReactNode;
  /** Visual style variant */
  variant?: ButtonVariant;
  /** HTML button type */
  type?: ButtonType;
  /** Click handler */
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Whether the button should take full width */
  fullWidth?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  type = 'button',
  onClick,
  disabled = false,
  className = '',
  fullWidth = false,
}) => {
  const baseClasses =
    'px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
    primary: {
      backgroundColor: 'var(--color-accent-primary)',
      color: '#ffffff',
    },
    secondary: {
      backgroundColor: 'var(--color-accent-lighter)',
      color: 'var(--color-accent-primary)',
      border: '1px solid var(--color-accent-primary)',
    },
    danger: {
      backgroundColor: 'var(--color-error)',
      color: '#ffffff',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--color-text-primary)',
    },
  };

  const classes = `${baseClasses} ${fullWidth ? 'w-full' : ''} ${className}`;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={classes}
      style={variantStyles[variant]}
    >
      {children}
    </button>
  );
};

export default Button;
