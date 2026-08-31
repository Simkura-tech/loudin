/**
 * Label Component
 * Form field label
 */

import styled from '@emotion/styled';
import { Text, type TextProps } from '../primitives/Text';

export interface LabelProps extends Omit<TextProps, 'variant' | 'as'> {
  children: React.ReactNode;
  /** Whether the field is required */
  required?: boolean;
  /** HTML for attribute */
  htmlFor?: string;
}

const StyledLabel = styled(Text.withComponent('label'))<{ required?: boolean }>`
  display: block;
  margin-bottom: ${({ theme }) => theme.spacing[1]};

  ${({ required, theme }) =>
    required &&
    `
    &::after {
      content: ' *';
      color: ${theme.colors.status.error};
    }
  `}
`;

export const Label: React.FC<LabelProps> = ({
  children,
  required,
  htmlFor,
  ...props
}) => {
  return (
    <StyledLabel
      variant="body-sm"
      weight="medium"
      htmlFor={htmlFor}
      required={required}
      {...props}
    >
      {children}
    </StyledLabel>
  );
};

export default Label;
