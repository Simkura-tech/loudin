/**
 * Emotion Theme Type Augmentation
 * This file extends Emotion's Theme type with our custom theme interface
 */

import '@emotion/react';
import type { Theme as AppTheme } from './types';

declare module '@emotion/react' {
  export interface Theme extends AppTheme {}
}
