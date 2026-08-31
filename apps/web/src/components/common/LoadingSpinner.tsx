import React from 'react';

export type SpinnerSize = 'small' | 'medium' | 'large';

export interface LoadingSpinnerProps {
  /** Size of the spinner */
  size?: SpinnerSize;
  /** Optional text to display below the spinner */
  text?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'medium', text }) => {
  const sizes: Record<SpinnerSize, string> = {
    small: 'h-4 w-4',
    medium: 'h-8 w-8',
    large: 'h-12 w-12',
  };

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <div
        className={`${sizes[size]} animate-spin rounded-full border-4`}
        style={{
          borderColor: 'var(--color-border-primary)',
          borderTopColor: 'var(--color-accent-primary)',
        }}
      />
      {text && (
        <p
          className="mt-4"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {text}
        </p>
      )}
    </div>
  );
};

export default LoadingSpinner;
