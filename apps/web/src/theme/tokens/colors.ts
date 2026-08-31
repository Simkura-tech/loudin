/**
 * Color Tokens
 * Based on Twenty CRM design system
 */

// Grayscale palette (Twenty CRM style - light mode)
export const gray = {
  0: '#FFFFFF',      // Pure white
  10: '#FCFCFC',     // Near white (gray2)
  15: '#F8F8F8',     // (gray3)
  20: '#F1F1F1',     // (gray4)
  25: '#EBEBEB',     // (gray5)
  30: '#D6D6D6',     // (gray6)
  35: '#CCCCCC',     // (gray7)
  40: '#B3B3B3',     // (gray8)
  50: '#999999',     // (gray9)
  60: '#838383',     // (gray10)
  70: '#666666',     // (gray11)
  80: '#333333',     // (gray12)
  85: '#1F1F1F',
  90: '#171717',     // Near black
  95: '#0F0F0F',
  100: '#000000',    // Pure black
} as const;

// Indigo/Blue accent (Twenty CRM primary)
export const blue = {
  10: '#FDFDFE',     // accent1 - lightest
  20: '#EAEEFF',     // accent2 - quaternary
  30: '#D9E2FC',     // accent3 - tertiary
  40: '#C6D4F9',     // accent4
  50: '#B1C5F6',     // accent5
  60: '#3E63DD',     // accent9 - PRIMARY (Twenty CRM blue)
  70: '#3A5CCC',     // accent10
  80: '#3451B2',     // accent11
  90: '#1F2D5C',     // accent12 - darkest
} as const;

// Extended accent scale for full range
export const accent = {
  1: '#FDFDFE',
  2: '#EAEEFF',
  3: '#D9E2FC',
  4: '#C6D4F9',
  5: '#B1C5F6',
  6: '#9EB5F2',
  7: '#8DA4EF',
  8: '#7B93EB',
  9: '#3E63DD',      // Primary
  10: '#3A5CCC',
  11: '#3451B2',
  12: '#1F2D5C',
} as const;

// Success/Green
export const green = {
  10: '#F0FDF4',
  20: '#DCFCE7',
  30: '#BBF7D0',
  40: '#86EFAC',
  50: '#4ADE80',
  60: '#30A46C',     // Twenty CRM green
  70: '#16A34A',
  80: '#15803D',
  90: '#166534',
} as const;

// Error/Red
export const red = {
  10: '#FFEFEF',     // danger background
  20: '#FEE2E2',
  30: '#FECACA',
  40: '#FCA5A5',
  50: '#F3AEAF',     // danger border
  60: '#E5484D',     // Twenty CRM red - Error/Danger
  70: '#DC2626',
  80: '#B91C1C',
  90: '#991B1B',
} as const;

// Warning/Orange
export const orange = {
  10: '#FFF7ED',
  20: '#FFEDD5',
  30: '#FED7AA',
  40: '#FDBA74',
  50: '#FB923C',
  60: '#F76B15',     // Twenty CRM orange
  70: '#EA580C',
  80: '#C2410C',
  90: '#9A3412',
} as const;

// Yellow
export const yellow = {
  10: '#FEFCE8',
  20: '#FEF9C3',
  30: '#FEF08A',
  40: '#FDE047',
  50: '#F5D90A',     // Twenty CRM yellow
  60: '#EAB308',
  70: '#CA8A04',
  80: '#A16207',
  90: '#854D0E',
} as const;

// Purple
export const purple = {
  10: '#FAF5FF',
  20: '#F3E8FF',
  30: '#E9D5FF',
  40: '#D8B4FE',
  50: '#C084FC',
  60: '#A855F7',
  70: '#9333EA',
  80: '#7C3AED',
  90: '#6B21A8',
} as const;

// Teal/Turquoise
export const teal = {
  10: '#F0FDFA',
  20: '#CCFBF1',
  30: '#99F6E4',
  40: '#5EEAD4',
  50: '#2DD4BF',
  60: '#14B8A6',
  70: '#0D9488',
  80: '#0F766E',
  90: '#115E59',
} as const;

// Semantic color mappings
export const semanticColors = {
  success: green[60],
  warning: orange[60],
  error: red[60],
  info: blue[60],
} as const;
