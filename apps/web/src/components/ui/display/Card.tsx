/**
 * Card Component
 * Container card with header, content, and footer
 */

import React from 'react';
import styled from '@emotion/styled';
import { css } from '@emotion/react';
import { Text } from '../primitives/Text';
import { Row } from '../primitives/Row';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Card variant */
  variant?: 'default' | 'outlined' | 'elevated';
  /** Padding size */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Clickable card */
  clickable?: boolean;
  /** Selected state */
  selected?: boolean;
  /** Full width */
  fullWidth?: boolean;
}

export interface CardHeaderProps {
  /** Header title */
  title: string;
  /** Header subtitle */
  subtitle?: string;
  /** Right side actions */
  actions?: React.ReactNode;
}

export interface CardContentProps {
  children: React.ReactNode;
  /** Content padding */
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export interface CardFooterProps {
  children: React.ReactNode;
  /** Align footer content */
  align?: 'left' | 'center' | 'right' | 'space-between';
}

const paddingMap = {
  none: '0',
  sm: '12px',
  md: '16px',
  lg: '24px',
};

const StyledCard = styled.div<{
  variant: 'default' | 'outlined' | 'elevated';
  padding: 'none' | 'sm' | 'md' | 'lg';
  clickable?: boolean;
  selected?: boolean;
  fullWidth?: boolean;
}>`
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.colors.background.primary};
  border-radius: ${({ theme }) => theme.borders.radius.lg};
  overflow: hidden;
  width: ${({ fullWidth }) => (fullWidth ? '100%' : 'auto')};
  transition: ${({ theme }) => theme.animations.transition.all};

  ${({ variant, theme }) =>
    variant === 'default' &&
    css`
      border: 1px solid ${theme.colors.border.primary};
    `}

  ${({ variant, theme }) =>
    variant === 'outlined' &&
    css`
      border: 1px solid ${theme.colors.border.secondary};
    `}

  ${({ variant, theme }) =>
    variant === 'elevated' &&
    css`
      border: none;
      box-shadow: ${theme.shadows.card};
    `}

  ${({ clickable, theme }) =>
    clickable &&
    css`
      cursor: pointer;

      &:hover {
        box-shadow: ${theme.shadows.cardHover};
        border-color: ${theme.colors.border.secondary};
      }
    `}

  ${({ selected, theme }) =>
    selected &&
    css`
      border-color: ${theme.colors.brand.primary};
      box-shadow: 0 0 0 1px ${theme.colors.brand.primary};
    `}
`;

const StyledCardHeader = styled.div<{ hasContent?: boolean }>`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing[4]};
  border-bottom: ${({ hasContent, theme }) =>
    hasContent ? `1px solid ${theme.colors.border.primary}` : 'none'};
`;

const HeaderTitles = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing[0.5]};
`;

const StyledCardContent = styled.div<{ padding: 'none' | 'sm' | 'md' | 'lg' }>`
  flex: 1;
  padding: ${({ padding }) => paddingMap[padding]};
`;

const StyledCardFooter = styled.div<{
  align: 'left' | 'center' | 'right' | 'space-between';
}>`
  display: flex;
  align-items: center;
  justify-content: ${({ align }) =>
    align === 'left'
      ? 'flex-start'
      : align === 'right'
      ? 'flex-end'
      : align === 'center'
      ? 'center'
      : 'space-between'};
  gap: ${({ theme }) => theme.spacing[2]};
  padding: ${({ theme }) => theme.spacing[4]};
  border-top: 1px solid ${({ theme }) => theme.colors.border.primary};
`;

// Card Header Component
export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  subtitle,
  actions,
}) => {
  return (
    <StyledCardHeader hasContent>
      <HeaderTitles>
        <Text variant="h5" weight="semibold">
          {title}
        </Text>
        {subtitle && (
          <Text variant="body-sm" color="secondary">
            {subtitle}
          </Text>
        )}
      </HeaderTitles>
      {actions && <Row gap={2}>{actions}</Row>}
    </StyledCardHeader>
  );
};

// Card Content Component
export const CardContent: React.FC<CardContentProps> = ({
  children,
  padding = 'md',
}) => {
  return <StyledCardContent padding={padding}>{children}</StyledCardContent>;
};

// Card Footer Component
export const CardFooter: React.FC<CardFooterProps> = ({
  children,
  align = 'right',
}) => {
  return <StyledCardFooter align={align}>{children}</StyledCardFooter>;
};

// Main Card Component
export const Card: React.FC<CardProps> & {
  Header: typeof CardHeader;
  Content: typeof CardContent;
  Footer: typeof CardFooter;
} = ({
  children,
  variant = 'default',
  padding = 'none',
  clickable,
  selected,
  fullWidth,
  ...props
}) => {
  return (
    <StyledCard
      variant={variant}
      padding={padding}
      clickable={clickable}
      selected={selected}
      fullWidth={fullWidth}
      {...props}
    >
      {children}
    </StyledCard>
  );
};

Card.Header = CardHeader;
Card.Content = CardContent;
Card.Footer = CardFooter;

export default Card;
