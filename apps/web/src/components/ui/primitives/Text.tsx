/**
 * Text Component
 * Typography component with variant support
 */

import styled from '@emotion/styled';
import type { Theme } from '../../../theme';

export type TextVariant =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'body-lg'
  | 'body-md'
  | 'body-sm'
  | 'caption'
  | 'overline';

export type TextColor =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'disabled'
  | 'inverse'
  | 'link'
  | 'success'
  | 'warning'
  | 'error'
  | 'info';

export type TextSize = 'xs' | 'sm' | 'base' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';

export interface TextProps {
  /** Typography variant */
  variant?: TextVariant;
  /** Size alias (maps to variant) */
  size?: TextSize;
  /** Text color */
  color?: TextColor | string;
  /** Font weight override */
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  /** Text alignment */
  align?: 'left' | 'center' | 'right' | 'justify';
  /** Whether to truncate with ellipsis */
  truncate?: boolean;
  /** Maximum number of lines (requires truncate) */
  maxLines?: number;
  /** Whether to use monospace font */
  mono?: boolean;
  /** Text transform */
  transform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  /** Letter spacing */
  letterSpacing?: string;
  /** Line height override */
  lineHeight?: string | number;
  /** As different HTML element */
  as?: keyof JSX.IntrinsicElements;
}

const getVariantStyles = (variant: TextVariant, theme: Theme) => {
  const styles: Record<TextVariant, { fontSize: string; fontWeight: number; lineHeight: number }> = {
    h1: {
      fontSize: theme.typography.fontSize['4xl'],
      fontWeight: theme.typography.fontWeight.bold,
      lineHeight: theme.typography.lineHeight.tight,
    },
    h2: {
      fontSize: theme.typography.fontSize['3xl'],
      fontWeight: theme.typography.fontWeight.semibold,
      lineHeight: theme.typography.lineHeight.tight,
    },
    h3: {
      fontSize: theme.typography.fontSize['2xl'],
      fontWeight: theme.typography.fontWeight.semibold,
      lineHeight: theme.typography.lineHeight.snug,
    },
    h4: {
      fontSize: theme.typography.fontSize.xl,
      fontWeight: theme.typography.fontWeight.semibold,
      lineHeight: theme.typography.lineHeight.snug,
    },
    h5: {
      fontSize: theme.typography.fontSize.lg,
      fontWeight: theme.typography.fontWeight.medium,
      lineHeight: theme.typography.lineHeight.normal,
    },
    h6: {
      fontSize: theme.typography.fontSize.md,
      fontWeight: theme.typography.fontWeight.medium,
      lineHeight: theme.typography.lineHeight.normal,
    },
    'body-lg': {
      fontSize: theme.typography.fontSize.lg,
      fontWeight: theme.typography.fontWeight.regular,
      lineHeight: theme.typography.lineHeight.relaxed,
    },
    'body-md': {
      fontSize: theme.typography.fontSize.md,
      fontWeight: theme.typography.fontWeight.regular,
      lineHeight: theme.typography.lineHeight.normal,
    },
    'body-sm': {
      fontSize: theme.typography.fontSize.sm,
      fontWeight: theme.typography.fontWeight.regular,
      lineHeight: theme.typography.lineHeight.normal,
    },
    caption: {
      fontSize: theme.typography.fontSize.xs,
      fontWeight: theme.typography.fontWeight.regular,
      lineHeight: theme.typography.lineHeight.normal,
    },
    overline: {
      fontSize: theme.typography.fontSize.xs,
      fontWeight: theme.typography.fontWeight.semibold,
      lineHeight: theme.typography.lineHeight.normal,
    },
  };

  return styles[variant];
};

const getSizeStyles = (size: TextSize, theme: Theme) => {
  const sizeMap: Record<TextSize, { fontSize: string; lineHeight: number }> = {
    xs: { fontSize: theme.typography.fontSize.xs, lineHeight: theme.typography.lineHeight.normal },
    sm: { fontSize: theme.typography.fontSize.sm, lineHeight: theme.typography.lineHeight.normal },
    base: { fontSize: theme.typography.fontSize.md, lineHeight: theme.typography.lineHeight.normal },
    md: { fontSize: theme.typography.fontSize.md, lineHeight: theme.typography.lineHeight.normal },
    lg: { fontSize: theme.typography.fontSize.lg, lineHeight: theme.typography.lineHeight.relaxed },
    xl: { fontSize: theme.typography.fontSize.xl, lineHeight: theme.typography.lineHeight.relaxed },
    '2xl': { fontSize: theme.typography.fontSize['2xl'], lineHeight: theme.typography.lineHeight.tight },
    '3xl': { fontSize: theme.typography.fontSize['3xl'], lineHeight: theme.typography.lineHeight.tight },
    '4xl': { fontSize: theme.typography.fontSize['4xl'], lineHeight: theme.typography.lineHeight.tight },
    '5xl': { fontSize: theme.typography.fontSize['5xl'], lineHeight: theme.typography.lineHeight.tight },
  };
  return sizeMap[size];
};

const getColor = (color: TextColor | string, theme: Theme): string => {
  const colorMap: Record<string, string> = {
    primary: theme.colors.text.primary,
    secondary: theme.colors.text.secondary,
    tertiary: theme.colors.text.tertiary,
    disabled: theme.colors.text.disabled,
    inverse: theme.colors.text.inverse,
    link: theme.colors.text.link,
    success: theme.colors.status.success,
    warning: theme.colors.status.warning,
    error: theme.colors.status.error,
    info: theme.colors.status.info,
  };

  return colorMap[color] || color;
};

export const Text = styled.span<TextProps>`
  font-family: ${({ theme, mono }) =>
    mono ? theme.typography.fontFamily.mono : theme.typography.fontFamily.primary};
  font-size: ${({ theme, variant, size }) => {
    if (size) return getSizeStyles(size, theme).fontSize;
    return getVariantStyles(variant || 'body-md', theme).fontSize;
  }};
  font-weight: ${({ theme, variant = 'body-md', weight }) =>
    weight ? theme.typography.fontWeight[weight] : getVariantStyles(variant, theme).fontWeight};
  line-height: ${({ theme, variant, size, lineHeight: lh }) => {
    if (lh) return lh;
    if (size) return getSizeStyles(size, theme).lineHeight;
    return getVariantStyles(variant || 'body-md', theme).lineHeight;
  }};
  color: ${({ theme, color = 'primary' }) => getColor(color, theme)};
  text-align: ${({ align }) => align};
  text-transform: ${({ transform, variant }) =>
    transform || (variant === 'overline' ? 'uppercase' : undefined)};
  letter-spacing: ${({ letterSpacing, variant }) =>
    letterSpacing || (variant === 'overline' ? '0.1em' : undefined)};
  margin: 0;

  ${({ truncate, maxLines }) =>
    truncate &&
    (maxLines
      ? `
        display: -webkit-box;
        -webkit-line-clamp: ${maxLines};
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
      `
      : `
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      `)}
`;

Text.defaultProps = {
  variant: 'body-md',
  color: 'primary',
};

export default Text;
