/**
 * Theme System Exports
 * Main entry point for the theme system
 */

// Theme configurations
export { lightTheme } from './lightTheme';
export { darkTheme } from './darkTheme';

// Global styles
export { GlobalStyles } from './GlobalStyles';

// Types
export type {
  Theme,
  ThemeColors,
  ThemeTypography,
  ThemeSpacing,
  ThemeComponentSpacing,
  ThemeBorders,
  ThemeShadows,
  ThemeAnimations,
  ThemeZIndex,
  ColorScale,
  GrayScale,
} from './types';

// Tokens (for direct access when needed)
export * from './tokens';
