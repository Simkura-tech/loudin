/**
 * Tooltip Component
 * Hover tooltip with positioning
 */

import React, { useState, useRef, useEffect } from 'react';
import styled from '@emotion/styled';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /** Tooltip content */
  content: React.ReactNode;
  /** Trigger element */
  children: React.ReactElement;
  /** Position */
  position?: TooltipPosition;
  /** Delay before showing (ms) */
  delay?: number;
  /** Whether tooltip is disabled */
  disabled?: boolean;
}

const TooltipContent = styled(motion.div)<{ position: TooltipPosition }>`
  position: fixed;
  z-index: ${({ theme }) => theme.zIndex.tooltip};
  padding: ${({ theme }) => `${theme.spacing[1.5]} ${theme.spacing[2.5]}`};
  background: ${({ theme }) => theme.colors.gray[90]};
  color: ${({ theme }) => theme.colors.gray[0]};
  font-family: ${({ theme }) => theme.typography.fontFamily.primary};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  border-radius: ${({ theme }) => theme.borders.radius.md};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  max-width: 250px;
  pointer-events: none;
  white-space: nowrap;

  &::after {
    content: '';
    position: absolute;
    border: 6px solid transparent;

    ${({ position, theme }) => {
      switch (position) {
        case 'top':
          return `
            bottom: -12px;
            left: 50%;
            transform: translateX(-50%);
            border-top-color: ${theme.colors.gray[90]};
          `;
        case 'bottom':
          return `
            top: -12px;
            left: 50%;
            transform: translateX(-50%);
            border-bottom-color: ${theme.colors.gray[90]};
          `;
        case 'left':
          return `
            right: -12px;
            top: 50%;
            transform: translateY(-50%);
            border-left-color: ${theme.colors.gray[90]};
          `;
        case 'right':
          return `
            left: -12px;
            top: 50%;
            transform: translateY(-50%);
            border-right-color: ${theme.colors.gray[90]};
          `;
      }
    }}
  }
`;

const tooltipVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 },
};

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  delay = 200,
  disabled = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const calculatePosition = () => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const offset = 8;

    let x = 0;
    let y = 0;

    switch (position) {
      case 'top':
        x = rect.left + rect.width / 2;
        y = rect.top - offset;
        break;
      case 'bottom':
        x = rect.left + rect.width / 2;
        y = rect.bottom + offset;
        break;
      case 'left':
        x = rect.left - offset;
        y = rect.top + rect.height / 2;
        break;
      case 'right':
        x = rect.right + offset;
        y = rect.top + rect.height / 2;
        break;
    }

    setCoords({ x, y });
  };

  const handleMouseEnter = () => {
    if (disabled) return;
    calculatePosition();
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const getTransformOrigin = () => {
    switch (position) {
      case 'top':
        return 'center bottom';
      case 'bottom':
        return 'center top';
      case 'left':
        return 'right center';
      case 'right':
        return 'left center';
    }
  };

  const getTransformStyle = () => {
    switch (position) {
      case 'top':
        return 'translate(-50%, -100%)';
      case 'bottom':
        return 'translate(-50%, 0)';
      case 'left':
        return 'translate(-100%, -50%)';
      case 'right':
        return 'translate(0, -50%)';
    }
  };

  const tooltip = (
    <AnimatePresence>
      {isVisible && (
        <TooltipContent
          position={position}
          style={{
            left: coords.x,
            top: coords.y,
            transform: getTransformStyle(),
            transformOrigin: getTransformOrigin(),
          }}
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={tooltipVariants}
          transition={{ duration: 0.15 }}
        >
          {content}
        </TooltipContent>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {React.cloneElement(children, {
        ref: triggerRef,
        onMouseEnter: handleMouseEnter,
        onMouseLeave: handleMouseLeave,
      })}
      {createPortal(tooltip, document.body)}
    </>
  );
};

export default Tooltip;
