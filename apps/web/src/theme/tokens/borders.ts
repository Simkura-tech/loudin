/**
 * Border Tokens
 * Based on Twenty CRM design system
 */

export const borderRadius = {
  none: '0px',
  xs: '2px',       // Subtle rounding
  sm: '4px',       // Buttons, inputs
  md: '8px',       // Cards, containers
  lg: '12px',      // Larger cards
  xl: '20px',      // Large cards (Twenty CRM)
  '2xl': '40px',   // Extra large (Twenty CRM xxl)
  '3xl': '24px',   // Legacy
  full: '9999px',  // Pills
  rounded: '100%', // Circles (Twenty CRM)
} as const;

export const borderWidth = {
  0: '0px',
  1: '1px',
  2: '2px',
  4: '4px',
  8: '8px',
} as const;
