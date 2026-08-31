/**
 * Stack Component
 * Vertical layout with configurable spacing
 */

import styled from '@emotion/styled';
import type { Theme } from '../../../theme';

export interface StackProps {
  /** Gap between children */
  gap?: keyof Theme['spacing'] | number;
  /** Horizontal alignment */
  align?: 'flex-start' | 'flex-end' | 'center' | 'stretch';
  /** Vertical alignment */
  justify?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
  /** Padding */
  padding?: keyof Theme['spacing'] | number;
  paddingX?: keyof Theme['spacing'] | number;
  paddingY?: keyof Theme['spacing'] | number;
  /** Width */
  width?: string;
  /** Height */
  height?: string;
  /** Flex grow */
  flex?: string | number;
  /** Whether to wrap children */
  wrap?: boolean;
}

const getSpacing = (theme: Theme, value?: keyof Theme['spacing'] | number): string => {
  if (value === undefined) return '0';
  if (typeof value === 'number') {
    return theme.spacing[value as keyof Theme['spacing']] || `${value * 4}px`;
  }
  return theme.spacing[value] || '0';
};

export const Stack = styled.div<StackProps>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme, gap = 0 }) => getSpacing(theme, gap)};
  align-items: ${({ align = 'stretch' }) => align};
  justify-content: ${({ justify }) => justify};
  flex-wrap: ${({ wrap }) => (wrap ? 'wrap' : 'nowrap')};
  width: ${({ width }) => width};
  height: ${({ height }) => height};
  flex: ${({ flex }) => flex};
  padding: ${({ theme, padding }) => (padding !== undefined ? getSpacing(theme, padding) : undefined)};
  padding-left: ${({ theme, paddingX }) => (paddingX !== undefined ? getSpacing(theme, paddingX) : undefined)};
  padding-right: ${({ theme, paddingX }) => (paddingX !== undefined ? getSpacing(theme, paddingX) : undefined)};
  padding-top: ${({ theme, paddingY }) => (paddingY !== undefined ? getSpacing(theme, paddingY) : undefined)};
  padding-bottom: ${({ theme, paddingY }) => (paddingY !== undefined ? getSpacing(theme, paddingY) : undefined)};
`;

export default Stack;
