/**
 * Typography Tokens
 * Based on Twenty CRM design system
 */

export const fontFamily = {
  primary: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: '"JetBrains Mono", "Fira Code", "SF Mono", Consolas, monospace',
} as const;

// Twenty CRM font sizes
export const fontSize = {
  xxs: '0.625rem',    // 10px
  xs: '0.85rem',      // 13.6px
  sm: '0.92rem',      // 14.72px
  base: '1rem',       // 16px (default/md)
  md: '1rem',         // 16px
  lg: '1.23rem',      // 19.68px
  xl: '1.54rem',      // 24.64px
  '2xl': '1.85rem',   // 29.6px (xxl)
  '3xl': '2.25rem',   // 36px
  '4xl': '3rem',      // 48px
  '5xl': '3.75rem',   // 60px
} as const;

// Twenty CRM font weights
export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

// Twenty CRM line heights
export const lineHeight = {
  tight: 1.1,         // md - headings, compact text
  snug: 1.25,
  normal: 1.5,        // lg - body text
  relaxed: 1.625,
  loose: 2,
} as const;

export const letterSpacing = {
  tighter: '-0.05em',
  tight: '-0.025em',
  normal: '0em',
  wide: '0.025em',
  wider: '0.05em',
} as const;
