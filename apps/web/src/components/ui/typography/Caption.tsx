/**
 * Caption Component
 * Small helper text
 */

import { Text, type TextProps } from '../primitives/Text';

export interface CaptionProps extends Omit<TextProps, 'variant' | 'as'> {
  children: React.ReactNode;
}

export const Caption: React.FC<CaptionProps> = ({
  children,
  color = 'secondary',
  ...props
}) => {
  return (
    <Text as="span" variant="caption" color={color} {...props}>
      {children}
    </Text>
  );
};

export default Caption;
