/**
 * Center Component
 * Centers content both horizontally and vertically
 */

import styled from '@emotion/styled';
import type { Theme } from '../../../theme';

export interface CenterProps {
  /** Padding */
  padding?: keyof Theme['spacing'] | number;
  /** Width */
  width?: string;
  /** Height */
  height?: string;
  /** Minimum height */
  minHeight?: string;
  /** Whether to center inline (horizontal only) */
  inline?: boolean;
}

const getSpacing = (theme: Theme, value?: keyof Theme['spacing'] | number): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === 'number') {
    return theme.spacing[value as keyof Theme['spacing']] || `${value * 4}px`;
  }
  return theme.spacing[value];
};

export const Center = styled.div<CenterProps>`
  display: ${({ inline }) => (inline ? 'inline-flex' : 'flex')};
  align-items: center;
  justify-content: center;
  width: ${({ width }) => width};
  height: ${({ height }) => height};
  min-height: ${({ minHeight }) => minHeight};
  padding: ${({ theme, padding }) => getSpacing(theme, padding)};
`;

export default Center;
