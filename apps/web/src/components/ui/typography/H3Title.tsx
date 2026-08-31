/**
 * H3Title Component
 * Subsection title
 */

import styled from '@emotion/styled';
import { Text, type TextProps } from '../primitives/Text';

export interface H3TitleProps extends Omit<TextProps, 'variant' | 'as'> {
  children: React.ReactNode;
}

const StyledH3 = styled(Text)`
  margin-bottom: ${({ theme }) => theme.spacing[2]};
`;

export const H3Title: React.FC<H3TitleProps> = ({ children, ...props }) => {
  return (
    <StyledH3 as="h3" variant="h3" {...props}>
      {children}
    </StyledH3>
  );
};

export default H3Title;
