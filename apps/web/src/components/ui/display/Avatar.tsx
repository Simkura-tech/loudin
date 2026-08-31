/**
 * Avatar Component
 * User avatar with image or initials fallback
 */

import React from 'react';
import styled from '@emotion/styled';
import { Icon, type IconProps } from '../Icon';
import { IconUser } from '@tabler/icons-react';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface AvatarProps {
  /** Image source */
  src?: string;
  /** Alt text */
  alt?: string;
  /** User name (for initials) */
  name?: string;
  /** Avatar size */
  size?: AvatarSize;
  /** Custom icon */
  icon?: IconProps['icon'];
  /** Badge indicator */
  badge?: 'online' | 'offline' | 'away' | 'busy';
  /** Squared shape */
  squared?: boolean;
}

const sizeMap: Record<AvatarSize, { size: string; fontSize: string; iconSize: number }> = {
  xs: { size: '24px', fontSize: '10px', iconSize: 12 },
  sm: { size: '32px', fontSize: '12px', iconSize: 14 },
  md: { size: '40px', fontSize: '14px', iconSize: 18 },
  lg: { size: '48px', fontSize: '16px', iconSize: 22 },
  xl: { size: '64px', fontSize: '20px', iconSize: 28 },
  '2xl': { size: '80px', fontSize: '24px', iconSize: 36 },
};

const badgeColors: Record<string, string> = {
  online: '#22C55E',
  offline: '#737373',
  away: '#F97316',
  busy: '#EF4444',
};

const AvatarWrapper = styled.div<{ size: AvatarSize }>`
  position: relative;
  width: ${({ size }) => sizeMap[size].size};
  height: ${({ size }) => sizeMap[size].size};
  flex-shrink: 0;
`;

const AvatarContainer = styled.div<{
  size: AvatarSize;
  squared?: boolean;
  hasImage?: boolean;
}>`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme, hasImage }) =>
    hasImage ? 'transparent' : theme.colors.brand.secondary};
  border-radius: ${({ theme, squared }) =>
    squared ? theme.borders.radius.md : theme.borders.radius.full};
  overflow: hidden;
  font-family: ${({ theme }) => theme.typography.fontFamily.primary};
  font-size: ${({ size }) => sizeMap[size].fontSize};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.brand.primary};
`;

const AvatarImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const StatusBadge = styled.span<{ status: string; size: AvatarSize }>`
  position: absolute;
  bottom: 0;
  right: 0;
  width: ${({ size }) => (size === 'xs' || size === 'sm' ? '8px' : '12px')};
  height: ${({ size }) => (size === 'xs' || size === 'sm' ? '8px' : '12px')};
  background: ${({ status }) => badgeColors[status]};
  border: 2px solid ${({ theme }) => theme.colors.background.primary};
  border-radius: 50%;
`;

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt,
  name,
  size = 'md',
  icon,
  badge,
  squared = false,
}) => {
  const [imageError, setImageError] = React.useState(false);

  const hasValidImage = src && !imageError;
  const initials = name ? getInitials(name) : null;
  const IconComponent = icon || IconUser;

  return (
    <AvatarWrapper size={size}>
      <AvatarContainer size={size} squared={squared} hasImage={!!hasValidImage}>
        {hasValidImage ? (
          <AvatarImage
            src={src}
            alt={alt || name || 'Avatar'}
            onError={() => setImageError(true)}
          />
        ) : initials ? (
          initials
        ) : (
          <Icon icon={IconComponent} size={sizeMap[size].iconSize} color="brand" />
        )}
      </AvatarContainer>
      {badge && <StatusBadge status={badge} size={size} />}
    </AvatarWrapper>
  );
};

export default Avatar;
