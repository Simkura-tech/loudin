/**
 * Global Styles
 * CSS reset and base styles using Emotion
 */

import { Global, css, useTheme } from '@emotion/react';

export const GlobalStyles = () => {
  const theme = useTheme();

  return (
    <Global
      styles={css`
        /* CSS Reset */
        *,
        *::before,
        *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        /* Document */
        html {
          font-size: 16px;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
          scroll-behavior: smooth;
        }

        body {
          font-family: ${theme.typography.fontFamily.primary};
          font-size: ${theme.typography.fontSize.md};
          font-weight: ${theme.typography.fontWeight.regular};
          line-height: ${theme.typography.lineHeight.normal};
          color: ${theme.colors.text.primary};
          background-color: ${theme.colors.background.primary};
          transition: ${theme.animations.transition.colors};
        }

        /* Typography */
        h1, h2, h3, h4, h5, h6 {
          font-weight: ${theme.typography.fontWeight.semibold};
          line-height: ${theme.typography.lineHeight.tight};
          color: ${theme.colors.text.primary};
        }

        h1 { font-size: ${theme.typography.fontSize['4xl']}; }
        h2 { font-size: ${theme.typography.fontSize['3xl']}; }
        h3 { font-size: ${theme.typography.fontSize['2xl']}; }
        h4 { font-size: ${theme.typography.fontSize.xl}; }
        h5 { font-size: ${theme.typography.fontSize.lg}; }
        h6 { font-size: ${theme.typography.fontSize.md}; }

        p {
          margin-bottom: ${theme.spacing[4]};
        }

        a {
          color: ${theme.colors.text.link};
          text-decoration: none;
          transition: ${theme.animations.transition.colors};

          &:hover {
            color: ${theme.colors.text.linkHover};
          }
        }

        /* Lists */
        ul, ol {
          list-style: none;
        }

        /* Images */
        img, picture, video, canvas, svg {
          display: block;
          max-width: 100%;
        }

        /* Form elements */
        input, button, textarea, select {
          font: inherit;
          color: inherit;
        }

        button {
          cursor: pointer;
          background: none;
          border: none;
        }

        /* Tables */
        table {
          border-collapse: collapse;
          border-spacing: 0;
        }

        /* Focus styles */
        :focus-visible {
          outline: 2px solid ${theme.colors.border.focus};
          outline-offset: 2px;
        }

        /* Selection */
        ::selection {
          background-color: ${theme.colors.brand.secondary};
          color: ${theme.colors.brand.primary};
        }

        /* Scrollbar styling */
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        ::-webkit-scrollbar-track {
          background: ${theme.colors.background.secondary};
        }

        ::-webkit-scrollbar-thumb {
          background: ${theme.colors.border.secondary};
          border-radius: ${theme.borders.radius.full};

          &:hover {
            background: ${theme.colors.border.strong};
          }
        }

        /* Utility classes */
        .visually-hidden {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        /* Prevent text selection on interactive elements */
        button, a {
          user-select: none;
        }

        /* Smooth transitions for theme changes */
        body,
        body * {
          transition-property: background-color, border-color, color, fill, stroke;
          transition-duration: ${theme.animations.duration.normal};
          transition-timing-function: ${theme.animations.easing.easeInOut};
        }

        /* Code blocks */
        code, pre, kbd, samp {
          font-family: ${theme.typography.fontFamily.mono};
          font-size: ${theme.typography.fontSize.sm};
        }

        pre {
          overflow-x: auto;
          padding: ${theme.spacing[4]};
          background-color: ${theme.colors.background.tertiary};
          border-radius: ${theme.borders.radius.md};
        }

        code {
          padding: ${theme.spacing[0.5]} ${theme.spacing[1]};
          background-color: ${theme.colors.background.tertiary};
          border-radius: ${theme.borders.radius.sm};
        }
      `}
    />
  );
};

export default GlobalStyles;
