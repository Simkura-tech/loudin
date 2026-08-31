import React from 'react';

export interface CardProps {
  /** Card content */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Optional card title */
  title?: string;
  /** Optional card subtitle */
  subtitle?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '', title, subtitle }) => {
  return (
    <div className={`card ${className}`}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && (
            <h2
              className="text-xl font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {title}
            </h2>
          )}
          {subtitle && (
            <p
              className="text-sm mt-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {subtitle}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  );
};

export default Card;
