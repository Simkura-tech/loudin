/**
 * Spacing Tokens
 * Based on 4px base unit system
 */

export const spacing = {
  0: '0px',
  px: '1px',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  2.5: '10px',
  3: '12px',
  3.5: '14px',
  4: '16px',
  5: '20px',
  6: '24px',
  7: '28px',
  8: '32px',
  9: '36px',
  10: '40px',
  11: '44px',
  12: '48px',
  14: '56px',
  16: '64px',
  20: '80px',
  24: '96px',
  28: '112px',
  32: '128px',
  36: '144px',
  40: '160px',
  44: '176px',
  48: '192px',
  52: '208px',
  56: '224px',
  60: '240px',
  64: '256px',
  72: '288px',
  80: '320px',
  96: '384px',
  // Named spacing aliases
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
} as const;

// Component-specific spacing
export const componentSpacing = {
  // Input/button heights
  inputHeightSm: '28px',
  inputHeightMd: '32px',
  inputHeightLg: '40px',

  // Sidebar
  sidebarWidth: '220px',
  sidebarWidthCollapsed: '52px',

  // Navbar
  navbarHeight: '48px',

  // Modal widths
  modalWidthSm: '400px',
  modalWidthMd: '520px',
  modalWidthLg: '680px',
  modalWidthXl: '900px',

  // Page layout
  pageMaxWidth: '1200px',
  pagePadding: '24px',
  pagePaddingMobile: '16px',
} as const;
