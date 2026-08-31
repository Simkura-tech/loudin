/**
 * Paragraph Component
 * Body text paragraph
 */

import styled from '@emotion/styled';
import { Text, type TextProps } from '../primitives/Text';

export interface ParagraphProps extends Omit<TextProps, 'as'> {
  children: React.ReactNode;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

const StyledParagraph = styled(Text)`
  margin-bottom: ${({ theme }) => theme.spacing[4]};

  &:last-child {
    margin-bottom: 0;
  }
`;

export const Paragraph: React.FC<ParagraphProps> = ({
  children,
  size = 'md',
  ...props
}) => {
  const variantMap = {
    sm: 'body-sm',
    md: 'body-md',
    lg: 'body-lg',
  } as const;

  return (
    <StyledParagraph as="p" variant={variantMap[size]} {...props}>
      {children}
    </StyledParagraph>
  );
};

export default Paragraph;
