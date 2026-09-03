/**
 * Style mixin for controls the current hardware cannot operate — muted,
 * desaturated, inert. Lives apart from CapabilityGate.tsx so that file
 * exports components only (react-refresh rule). See CapabilityGate.tsx for
 * the treatment as a whole.
 */

import { css } from '@emotion/react';

export const unsupportedStyle = css`
  opacity: 0.5;
  filter: grayscale(1);
  cursor: not-allowed;
  pointer-events: auto; /* keep the tooltip reachable */
  user-select: none;
`;
