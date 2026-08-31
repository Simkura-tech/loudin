/**
 * Dark Theme Configuration
 */

import type { Theme } from './types';
import {
  gray,
  blue,
  green,
  red,
  orange,
  yellow,
  purple,
  teal,
} from './tokens/colors';
import { fontFamily, fontSize, fontWeight, lineHeight } from './tokens/typography';
import { spacing, componentSpacing } from './tokens/spacing';
import { borderRadius, borderWidth } from './tokens/borders';
import { shadowsDark } from './tokens/shadows';
import { duration, easing, transition } from './tokens/animations';

export const darkTheme: Theme = {
  name: 'dark',

  colors: {
    background: {
      primary: gray[95],
      secondary: gray[90],
      tertiary: gray[85],
      inverse: gray[10],
      overlay: 'rgba(0, 0, 0, 0.7)',
    },

    text: {
      primary: gray[10],
      secondary: gray[40],
      tertiary: gray[50],
      disabled: gray[60],
      inverse: gray[90],
      link: blue[50],
      linkHover: blue[40],
    },

    border: {
      primary: gray[80],
      secondary: gray[70],
      strong: gray[60],
      focus: blue[50],
      light: gray[80],
      medium: gray[70],
    },

    brand: {
      primary: blue[50],
      primaryHover: blue[40],
      primaryActive: blue[30],
      secondary: 'rgba(59, 130, 246, 0.15)',
    },

    status: {
      success: green[50],
      successBackground: 'rgba(34, 197, 94, 0.15)',
      successBorder: green[70],
      warning: orange[50],
      warningBackground: 'rgba(249, 115, 22, 0.15)',
      warningBorder: orange[70],
      error: red[50],
      errorBackground: 'rgba(239, 68, 68, 0.15)',
      errorBorder: red[70],
      info: blue[50],
      infoBackground: 'rgba(59, 130, 246, 0.15)',
      infoBorder: blue[70],
    },

    interactive: {
      hover: gray[85],
      active: gray[80],
      selected: 'rgba(59, 130, 246, 0.2)',
      selectedHover: 'rgba(59, 130, 246, 0.3)',
      disabled: gray[85],
    },

    gray,
    blue,
    green,
    red,
    orange,
    yellow,
    purple,
    teal,
  },

  typography: {
    fontFamily,
    fontSize,
    fontWeight,
    lineHeight,
  },

  spacing: spacing as Theme['spacing'],
  componentSpacing,

  borders: {
    radius: borderRadius,
    width: borderWidth,
  },

  shadows: shadowsDark,

  animations: {
    duration,
    easing,
    transition,
  },

  zIndex: {
    hide: -1,
    base: 0,
    dropdown: 100,
    sticky: 200,
    fixed: 300,
    modalBackdrop: 400,
    modal: 500,
    popover: 600,
    tooltip: 700,
    toast: 800,
  },
};
