/**
 * CountryInput — text input with an ISO 3166-1 datalist for typeahead.
 *
 * Native `<datalist>` keeps this lightweight: no dependency, works with
 * keyboard, and still accepts free-text entries (so users can type a
 * country name not on our list without being blocked — useful for
 * disputed regions or local-language names).
 *
 * Renders ONE shared `<datalist id="iso-countries">` per page. Multiple
 * CountryInputs all bind to it (idempotent — the second/third element
 * just declares the same id and the browser uses the first).
 */

import styled from '@emotion/styled';
import { COUNTRIES } from '../../constants/countries';

const COUNTRY_DATALIST_ID = 'iso-countries';

const Input = styled.input`
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  font-size: 13px;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.brand.primary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.brand.primary}26;
  }
  &:disabled {
    background: ${({ theme }) => theme.colors.background.secondary};
    color: ${({ theme }) => theme.colors.text.tertiary};
    cursor: not-allowed;
  }
`;

interface CountryInputProps {
  id?:        string;
  value:      string;
  onChange:   (next: string) => void;
  disabled?:  boolean;
  placeholder?: string;
}

export function CountryInput({
  id,
  value,
  onChange,
  disabled,
  placeholder = 'Start typing a country…',
}: CountryInputProps) {
  return (
    <>
      <Input
        id={id}
        type="text"
        list={COUNTRY_DATALIST_ID}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={100}
        autoComplete="country-name"
      />
      {/* Shared list — first instance defines it for the whole page.
          Duplicates from other CountryInput renders are harmless. */}
      <datalist id={COUNTRY_DATALIST_ID}>
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.name} />
        ))}
      </datalist>
    </>
  );
}

export default CountryInput;
