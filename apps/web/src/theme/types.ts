/**
 * Theme Type Definitions
 * Complete TypeScript types for the theme system
 */


// Color scale type
export type ColorScale = {
  10: string;
  20: string;
  30: string;
  40: string;
  50: string;
  60: string;
  70: string;
  80: string;
  90: string;
};

// Extended gray scale
export type GrayScale = {
  0: string;
  10: string;
  15: string;
  20: string;
  25: string;
  30: string;
  35: string;
  40: string;
  50: string;
  60: string;
  70: string;
  80: string;
  85: string;
  90: string;
  95: string;
  100: string;
};

// Theme colors (semantic)
export interface ThemeColors {
  // Background colors
  background: {
    primary: string;
    secondary: string;
    tertiary: string;
    inverse: string;
    overlay: string;
  };

  // Text colors
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    disabled: string;
    inverse: string;
    link: string;
    linkHover: string;
  };

  // Border colors
  border: {
    primary: string;
    secondary: string;
    strong: string;
    focus: string;
    light: string;   // alias for primary
    medium: string;  // alias for secondary
  };

  // Brand colors
  brand: {
    primary: string;
    primaryHover: string;
    primaryActive: string;
    secondary: string;
    blue?: string;
  };

  // Accent color (shorthand)
  accent?: string;

  // Status colors
  status: {
    success: string;
    successBackground: string;
    successBorder: string;
    warning: string;
    warningBackground: string;
    warningBorder: string;
    error: string;
    errorBackground: string;
    errorBorder: string;
    info: string;
    infoBackground: string;
    infoBorder: string;
  };

  // Interactive states
  interactive: {
    hover: string;
    active: string;
    selected: string;
    selectedHover: string;
    disabled: string;
  };

  // Raw color scales (for advanced usage)
  gray: GrayScale;
  blue: ColorScale;
  green: ColorScale;
  red: ColorScale;
  orange: ColorScale;
  yellow: ColorScale;
  purple: ColorScale;
  teal: ColorScale;
}

// Typography theme
export interface ThemeTypography {
  fontFamily: {
    primary: string;
    mono: string;
  };
  fontSize: {
    xxs: string;
    xs: string;
    sm: string;
    base: string;
    md: string;
    lg: string;
    xl: string;
    '2xl': string;
    '3xl': string;
    '4xl': string;
    '5xl': string;
  };
  fontWeight: {
    regular: number;
    medium: number;
    semibold: number;
    bold: number;
  };
  lineHeight: {
    tight: number;
    snug: number;
    normal: number;
    relaxed: number;
    loose: number;
  };
}

// Spacing theme
export interface ThemeSpacing {
  0: string;
  px: string;
  0.5: string;
  1: string;
  1.5: string;
  2: string;
  2.5: string;
  3: string;
  3.5: string;
  4: string;
  5: string;
  6: string;
  7: string;
  8: string;
  9: string;
  10: string;
  11: string;
  12: string;
  14: string;
  16: string;
  20: string;
  24: string;
  // Named spacing aliases
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  [key: number]: string;
  [key: string]: string;
}

// Component spacing
export interface ThemeComponentSpacing {
  inputHeightSm: string;
  inputHeightMd: string;
  inputHeightLg: string;
  sidebarWidth: string;
  sidebarWidthCollapsed: string;
  navbarHeight: string;
  modalWidthSm: string;
  modalWidthMd: string;
  modalWidthLg: string;
  modalWidthXl: string;
  pageMaxWidth: string;
  pagePadding: string;
  pagePaddingMobile: string;
}

// Border theme
export interface ThemeBorders {
  radius: {
    none: string;
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    '2xl': string;
    '3xl': string;
    full: string;
    rounded: string;
  };
  width: {
    0: string;
    1: string;
    2: string;
    4: string;
    8: string;
  };
}

// Shadow theme
export interface ThemeShadows {
  none: string;
  // Twenty CRM semantic shadows
  light: string;
  strong: string;
  underline: string;
  superHeavy: string;
  // Legacy size-based shadows
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
  inner: string;
  // Component-specific shadows
  dropdown: string;
  modal: string;
  card: string;
  cardHover: string;
}

// Animation theme
export interface ThemeAnimations {
  duration: {
    instant: string;
    fast: string;
    normal: string;
    slow: string;
    slower: string;
    slowest: string;
  };
  easing: {
    linear: string;
    easeIn: string;
    easeOut: string;
    easeInOut: string;
    spring: string;
  };
  transition: {
    all: string;
    colors: string;
    opacity: string;
    transform: string;
    shadow: string;
  };
}

// Z-index scale
export interface ThemeZIndex {
  hide: number;
  base: number;
  dropdown: number;
  sticky: number;
  fixed: number;
  modalBackdrop: number;
  modal: number;
  popover: number;
  tooltip: number;
  toast: number;
}

// Complete Theme Interface
export interface Theme {
  name: 'light' | 'dark';
  colors: ThemeColors;
  typography: ThemeTypography;
  spacing: ThemeSpacing;
  componentSpacing: ThemeComponentSpacing;
  borders: ThemeBorders;
  shadows: ThemeShadows;
  animations: ThemeAnimations;
  zIndex: ThemeZIndex;
}

