/**
 * ─── WHITE-LABEL BRANDING ────────────────────────────────────────────────────
 *
 * This is the ONE file an integrator edits to re-brand the frontend.
 * Every product-name string, legal/contact email, and brand asset path in the
 * UI reads from the `branding` object below. Change the values, replace the
 * image files listed under `assets`, rebuild — done.
 *
 * See docs/white-label.md for the full step-by-step guide (including where
 * theme colors live and which static files in index.html / public/ to touch).
 */

export interface Branding {
  /** Product name shown everywhere in the UI: nav wordmark, page titles,
   *  auth screens, confirmation dialogs, API docs prose. */
  productName: string;

  /** Legal entity used in footers ("© 2026 <companyLegalName>") and in the
   *  Terms of Service / Privacy Policy placeholder copy. Often the same as
   *  productName; use your registered company name if it differs. */
  companyLegalName: string;

  /** Short marketing tagline. Used as the default browser-tab title
   *  ("<productName> — <tagline>") until a page sets its own. */
  tagline: string;

  /** Contact addresses surfaced in user-facing copy. The legal/privacy ones
   *  appear in the Terms of Service and Privacy Policy pages. */
  supportEmail: string;
  legalEmail: string;
  privacyEmail: string;

  /** Optional links. Leave as-is or point at your own docs / fork.
   *  Currently only referenced from docs prose, safe to ignore. */
  docsUrl?: string;
  repoUrl?: string;

  /**
   * Brand image assets. These are FILES you replace in place (keep the same
   * paths so index.html keeps working) — the paths here are exported so any
   * future <img> usage has a single source of truth.
   *
   *   public/icon-circle.png  — favicon + apple-touch-icon (square PNG,
   *                             512×512 recommended; referenced from
   *                             index.html which cannot import this file)
   *   public/logo-nav.png     — horizontal logo, available for nav use
   *                             (the default UI renders a text wordmark
   *                             from productName instead)
   *   public/thumbnail.jpg    — social-share / preview image
   */
  assets: {
    icon: string;
    navLogo: string;
    thumbnail: string;
  };
}

export const branding: Branding = {
  productName:      'Loudin',
  companyLegalName: 'Loudin',
  tagline:          'Open-source access control',

  supportEmail: 'support@example.com',
  legalEmail:   'legal@example.com',
  privacyEmail: 'privacy@example.com',

  // docsUrl: 'https://docs.example.com',
  // repoUrl: 'https://github.com/your-org/your-fork',

  assets: {
    icon:      '/icon-circle.png',
    navLogo:   '/logo-nav.png',
    thumbnail: '/thumbnail.jpg',
  },
};

export default branding;
