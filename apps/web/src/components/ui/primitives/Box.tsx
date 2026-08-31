/**
 * Box Component
 * Base container with flexible styling via props
 */

import styled from '@emotion/styled';
import type { Theme } from '../../../theme';

export interface BoxProps {
  /** Display type */
  display?: 'block' | 'flex' | 'inline-flex' | 'inline' | 'inline-block' | 'grid' | 'none';
  /** Flex direction */
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  /** Justify content */
  justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
  /** Align items */
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
  /** Gap between children */
  gap?: keyof Theme['spacing'] | string;
  /** Padding */
  padding?: keyof Theme['spacing'] | string;
  paddingX?: keyof Theme['spacing'] | string;
  paddingY?: keyof Theme['spacing'] | string;
  paddingTop?: keyof Theme['spacing'] | string;
  paddingBottom?: keyof Theme['spacing'] | string;
  paddingLeft?: keyof Theme['spacing'] | string;
  paddingRight?: keyof Theme['spacing'] | string;
  /** Margin */
  margin?: keyof Theme['spacing'] | string;
  marginX?: keyof Theme['spacing'] | string;
  marginY?: keyof Theme['spacing'] | string;
  marginTop?: keyof Theme['spacing'] | string;
  marginBottom?: keyof Theme['spacing'] | string;
  marginLeft?: keyof Theme['spacing'] | string;
  marginRight?: keyof Theme['spacing'] | string;
  /** Width and height */
  width?: string;
  height?: string;
  minWidth?: string;
  minHeight?: string;
  maxWidth?: string;
  maxHeight?: string;
  /** Flex properties */
  flex?: string | number;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: string;
  flexWrap?: 'wrap' | 'nowrap' | 'wrap-reverse';
  /** Background color */
  background?: keyof Theme['colors']['background'] | string;
  /** Border radius */
  borderRadius?: keyof Theme['borders']['radius'] | string;
  /** Border */
  border?: string;
  borderColor?: keyof Theme['colors']['border'] | string;
  /** Box shadow */
  boxShadow?: keyof Theme['shadows'] | string;
  /** Position */
  position?: 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky';
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  zIndex?: number;
  /** Overflow */
  overflow?: 'visible' | 'hidden' | 'scroll' | 'auto';
  overflowX?: 'visible' | 'hidden' | 'scroll' | 'auto';
  overflowY?: 'visible' | 'hidden' | 'scroll' | 'auto';
  /** Cursor */
  cursor?: string;
  /** Transition */
  transition?: string;
}

const getSpacing = (theme: Theme, value?: keyof Theme['spacing'] | string): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'number' || !isNaN(Number(value))) {
    return theme.spacing[value as keyof Theme['spacing']] || `${value}px`;
  }
  return value;
};

const getBackground = (theme: Theme, value?: keyof Theme['colors']['background'] | string): string | undefined => {
  if (!value) return undefined;
  if (value in theme.colors.background) {
    return theme.colors.background[value as keyof Theme['colors']['background']];
  }
  return value;
};

const getBorderRadius = (theme: Theme, value?: keyof Theme['borders']['radius'] | string): string | undefined => {
  if (!value) return undefined;
  if (value in theme.borders.radius) {
    return theme.borders.radius[value as keyof Theme['borders']['radius']];
  }
  return value;
};

const getBorderColor = (theme: Theme, value?: keyof Theme['colors']['border'] | string): string | undefined => {
  if (!value) return undefined;
  if (value in theme.colors.border) {
    return theme.colors.border[value as keyof Theme['colors']['border']];
  }
  return value;
};

const getShadow = (theme: Theme, value?: keyof Theme['shadows'] | string): string | undefined => {
  if (!value) return undefined;
  if (value in theme.shadows) {
    return theme.shadows[value as keyof Theme['shadows']];
  }
  return value;
};

export const Box = styled.div<BoxProps>`
  display: ${({ display }) => display};
  flex-direction: ${({ flexDirection }) => flexDirection};
  justify-content: ${({ justifyContent }) => justifyContent};
  align-items: ${({ alignItems }) => alignItems};
  flex-wrap: ${({ flexWrap }) => flexWrap};
  gap: ${({ theme, gap }) => getSpacing(theme, gap)};

  padding: ${({ theme, padding }) => getSpacing(theme, padding)};
  padding-top: ${({ theme, paddingY, paddingTop }) => getSpacing(theme, paddingTop || paddingY)};
  padding-bottom: ${({ theme, paddingY, paddingBottom }) => getSpacing(theme, paddingBottom || paddingY)};
  padding-left: ${({ theme, paddingX, paddingLeft }) => getSpacing(theme, paddingLeft || paddingX)};
  padding-right: ${({ theme, paddingX, paddingRight }) => getSpacing(theme, paddingRight || paddingX)};

  margin: ${({ theme, margin }) => getSpacing(theme, margin)};
  margin-top: ${({ theme, marginY, marginTop }) => getSpacing(theme, marginTop || marginY)};
  margin-bottom: ${({ theme, marginY, marginBottom }) => getSpacing(theme, marginBottom || marginY)};
  margin-left: ${({ theme, marginX, marginLeft }) => getSpacing(theme, marginLeft || marginX)};
  margin-right: ${({ theme, marginX, marginRight }) => getSpacing(theme, marginRight || marginX)};

  width: ${({ width }) => width};
  height: ${({ height }) => height};
  min-width: ${({ minWidth }) => minWidth};
  min-height: ${({ minHeight }) => minHeight};
  max-width: ${({ maxWidth }) => maxWidth};
  max-height: ${({ maxHeight }) => maxHeight};

  flex: ${({ flex }) => flex};
  flex-grow: ${({ flexGrow }) => flexGrow};
  flex-shrink: ${({ flexShrink }) => flexShrink};
  flex-basis: ${({ flexBasis }) => flexBasis};

  background: ${({ theme, background }) => getBackground(theme, background)};
  border-radius: ${({ theme, borderRadius }) => getBorderRadius(theme, borderRadius)};
  border: ${({ border }) => border};
  border-color: ${({ theme, borderColor }) => getBorderColor(theme, borderColor)};
  box-shadow: ${({ theme, boxShadow }) => getShadow(theme, boxShadow)};

  position: ${({ position }) => position};
  top: ${({ top }) => top};
  right: ${({ right }) => right};
  bottom: ${({ bottom }) => bottom};
  left: ${({ left }) => left};
  z-index: ${({ zIndex }) => zIndex};

  overflow: ${({ overflow }) => overflow};
  overflow-x: ${({ overflowX }) => overflowX};
  overflow-y: ${({ overflowY }) => overflowY};

  cursor: ${({ cursor }) => cursor};
  transition: ${({ transition }) => transition};
`;

Box.defaultProps = {
  display: 'block',
};

export default Box;
