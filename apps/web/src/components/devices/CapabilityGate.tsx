/**
 * Visual treatment for features the current hardware cannot do.
 *
 * Pairs with `useDeviceCapabilities`: a gate says *whether* something is
 * available and *why not*; these pieces say how that looks. One rule
 * everywhere — the control stays in place (so the page reads the same on
 * every board and people learn where things are), goes muted and
 * non-interactive, and carries the reason as a tooltip and, on tiles, as a
 * small badge.
 *
 *   unsupportedStyle   emotion mixin for buttons, tabs, and other controls
 *                      (in ./capabilityStyles.ts — this file exports
 *                      components only, for fast refresh)
 *   UnsupportedBadge   the "Not on this hardware" pill for tiles and panels
 */

import styled from '@emotion/styled';
import { IconCircleOff } from '@tabler/icons-react';

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px dashed ${({ theme }) => theme.colors.border.medium};
  background: ${({ theme }) => theme.colors.background.secondary};
  color: ${({ theme }) => theme.colors.text.tertiary};
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: help;
`;

interface BadgeProps {
  /** The gate's reason — shown as the tooltip. */
  reason?: string | null;
  className?: string;
}

export function UnsupportedBadge({ reason, className }: BadgeProps) {
  return (
    <Badge className={className} title={reason ?? undefined} aria-label={reason ?? 'Not on this hardware'}>
      <IconCircleOff size={11} strokeWidth={2.2} />
      Not on this hardware
    </Badge>
  );
}
