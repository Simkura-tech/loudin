/**
 * H1Title Component
 * Primary page title
 */

import styled from '@emotion/styled';
import { Text, type TextProps } from '../primitives/Text';

export interface H1TitleProps extends Omit<TextProps, 'variant' | 'as'> {
  children: React.ReactNode;
}

const StyledH1 = styled(Text)`
  margin-bottom: ${({ theme }) => theme.spacing[4]};
`;

export const H1Title: React.FC<H1TitleProps> = ({ children, ...props }) => {
  return (
    <StyledH1 as="h1" variant="h1" {...props}>
      {children}
    </StyledH1>
  );
};

export default H1Title;
