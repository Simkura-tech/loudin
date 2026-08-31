/**
 * H2Title Component
 * Section title
 */

import styled from '@emotion/styled';
import { Text, type TextProps } from '../primitives/Text';

export interface H2TitleProps extends Omit<TextProps, 'variant' | 'as'> {
  children: React.ReactNode;
}

const StyledH2 = styled(Text)`
  margin-bottom: ${({ theme }) => theme.spacing[3]};
`;

export const H2Title: React.FC<H2TitleProps> = ({ children, ...props }) => {
  return (
    <StyledH2 as="h2" variant="h2" {...props}>
      {children}
    </StyledH2>
  );
};

export default H2Title;
