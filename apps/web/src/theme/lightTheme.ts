/**
 * Light Theme Configuration
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
import { shadowsLight } from './tokens/shadows';
import { duration, easing, transition } from './tokens/animations';

export const lightTheme: Theme = {
  name: 'light',

  colors: {
    background: {
      primary: gray[0],
      secondary: gray[10],
      tertiary: gray[15],
      inverse: gray[90],
      overlay: 'rgba(0, 0, 0, 0.5)',
    },

    text: {
      primary: gray[90],
      secondary: gray[60],
      tertiary: gray[50],
      disabled: gray[40],
      inverse: gray[0],
      link: blue[60],
      linkHover: blue[70],
    },

    border: {
      primary: gray[20],
      secondary: gray[25],
      strong: gray[30],
      focus: blue[60],
      light: gray[20],
      medium: gray[25],
    },

    brand: {
      primary: blue[60],
      primaryHover: blue[70],
      primaryActive: blue[80],
      secondary: blue[10],
    },

    status: {
      success: green[60],
      successBackground: green[10],
      successBorder: green[30],
      warning: orange[60],
      warningBackground: orange[10],
      warningBorder: orange[30],
      error: red[60],
      errorBackground: red[10],
      errorBorder: red[30],
      info: blue[60],
      infoBackground: blue[10],
      infoBorder: blue[30],
    },

    interactive: {
      hover: gray[10],
      active: gray[15],
      selected: blue[10],
      selectedHover: blue[20],
      disabled: gray[15],
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

  shadows: shadowsLight,

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
