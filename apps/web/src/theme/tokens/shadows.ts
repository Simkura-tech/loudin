/**
 * Shadow Tokens
 * Based on Twenty CRM design system
 */

export const shadowsLight = {
  none: 'none',

  // Twenty CRM shadows
  light: `
    0px 2px 4px 0px rgba(252, 252, 252, 0.04),
    0px 0px 4px 0px rgba(235, 235, 235, 0.08)
  `,
  strong: `
    2px 4px 16px 0px rgba(204, 204, 204, 0.16),
    0px 2px 4px 0px rgba(235, 235, 235, 0.08)
  `,
  underline: '0px 1px 0px 0px rgba(153, 153, 153, 0.32)',
  superHeavy: `
    0px 0px 8px 0px rgba(204, 204, 204, 0.12),
    0px 8px 64px -16px rgba(131, 131, 131, 0.24),
    0px 24px 56px -16px rgba(235, 235, 235, 0.16)
  `,

  // Legacy sizes (for compatibility)
  xs: '0px 1px 2px rgba(0, 0, 0, 0.05)',
  sm: '0px 1px 3px rgba(0, 0, 0, 0.1), 0px 1px 2px rgba(0, 0, 0, 0.06)',
  md: '0px 4px 6px -1px rgba(0, 0, 0, 0.1), 0px 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0px 10px 15px -3px rgba(0, 0, 0, 0.1), 0px 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0px 20px 25px -5px rgba(0, 0, 0, 0.1), 0px 10px 10px -5px rgba(0, 0, 0, 0.04)',
  '2xl': '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
  inner: 'inset 0px 2px 4px rgba(0, 0, 0, 0.06)',

  // Component-specific shadows
  dropdown: `
    2px 4px 16px 0px rgba(204, 204, 204, 0.16),
    0px 2px 4px 0px rgba(235, 235, 235, 0.08)
  `,
  modal: `
    0px 0px 8px 0px rgba(204, 204, 204, 0.12),
    0px 8px 64px -16px rgba(131, 131, 131, 0.24),
    0px 24px 56px -16px rgba(235, 235, 235, 0.16)
  `,
  card: '0px 2px 4px 0px rgba(252, 252, 252, 0.04), 0px 0px 4px 0px rgba(235, 235, 235, 0.08)',
  cardHover: '2px 4px 16px 0px rgba(204, 204, 204, 0.16), 0px 2px 4px 0px rgba(235, 235, 235, 0.08)',
} as const;

export const shadowsDark = {
  none: 'none',

  // Twenty CRM dark mode shadows
  light: `
    0px 2px 4px 0px rgba(0, 0, 0, 0.04),
    0px 0px 4px 0px rgba(0, 0, 0, 0.08)
  `,
  strong: `
    2px 4px 16px 0px rgba(0, 0, 0, 0.16),
    0px 2px 4px 0px rgba(0, 0, 0, 0.08)
  `,
  underline: '0px 1px 0px 0px rgba(0, 0, 0, 0.32)',
  superHeavy: `
    2px 4px 16px 0px rgba(0, 0, 0, 0.12),
    0px 2px 4px 0px rgba(0, 0, 0, 0.04)
  `,

  // Legacy sizes
  xs: '0px 1px 2px rgba(0, 0, 0, 0.3)',
  sm: '0px 1px 3px rgba(0, 0, 0, 0.4), 0px 1px 2px rgba(0, 0, 0, 0.3)',
  md: '0px 4px 6px -1px rgba(0, 0, 0, 0.4), 0px 2px 4px -1px rgba(0, 0, 0, 0.3)',
  lg: '0px 10px 15px -3px rgba(0, 0, 0, 0.4), 0px 4px 6px -2px rgba(0, 0, 0, 0.3)',
  xl: '0px 20px 25px -5px rgba(0, 0, 0, 0.4), 0px 10px 10px -5px rgba(0, 0, 0, 0.3)',
  '2xl': '0px 25px 50px -12px rgba(0, 0, 0, 0.5)',
  inner: 'inset 0px 2px 4px rgba(0, 0, 0, 0.3)',

  // Component-specific shadows
  dropdown: '0px 4px 16px rgba(0, 0, 0, 0.4)',
  modal: '0px 16px 48px rgba(0, 0, 0, 0.5)',
  card: '0px 2px 8px rgba(0, 0, 0, 0.3)',
  cardHover: '0px 4px 16px rgba(0, 0, 0, 0.4)',
} as const;
