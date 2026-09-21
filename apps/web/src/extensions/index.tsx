/**
 * ─── FRONTEND EXTENSIONS ─────────────────────────────────────────────────────
 *
 * This is the ONE file a fork edits to add pages on top of Loudin — public
 * routes, signed-in routes, sidebar items, settings tabs. Loudin ships it
 * empty and never changes it again, so your edits here never conflict with
 * an upstream merge. Put the pages themselves in subfolders next to this
 * file (src/extensions/billing/…).
 *
 * The shape is defined in ./types.ts; the full guide is docs/extensions.md.
 */

import type { WebExtensions } from './types';

export const extensions: WebExtensions = {
  publicRoutes: [],
  appRoutes: [],
  navItems: [],
  settingsTabs: [],
};
