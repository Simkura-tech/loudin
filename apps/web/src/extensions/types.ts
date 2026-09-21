/**
 * Frontend extension contract — upstream-owned. The registry you edit is
 * ./index.ts; see docs/extensions.md.
 */

import type { ComponentType, ReactElement } from 'react';
import type { AuthUser } from '../services/auth/auth';

/** A route to splice into the router. Mirrors <Route>: give `path`, or set
 *  `index` for a layout's default child; `children` nest under `element`
 *  (which should then render an <Outlet />). */
export interface ExtensionRoute {
  path?: string;
  index?: boolean;
  element: ReactElement;
  children?: ExtensionRoute[];
}

/** Sidebar entry. `visible` receives the signed-in user; omit to show it to
 *  everyone. Extension items are hidden while impersonating, like Settings. */
export interface ExtensionNavItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  /** Heading to group under in the platform-admin sidebar (ignored in the
   *  flat end-user sidebar). Items sharing a section share one heading. */
  section?: string;
  visible?: (user: AuthUser) => boolean;
}

/** A tab under /app/settings. `path` is relative ("billing"). */
export interface ExtensionSettingsTab {
  path: string;
  label: string;
  element: ReactElement;
  visible?: (user: AuthUser) => boolean;
}

export interface WebExtensions {
  /** Replaces the default "/" → /login redirect (e.g. a marketing home). */
  home?: ReactElement;
  /** Unauthenticated routes, mounted at the top level. */
  publicRoutes: ExtensionRoute[];
  /** Routes under /app — inside ProtectedRoute and the AppLayout chrome. */
  appRoutes: ExtensionRoute[];
  navItems: ExtensionNavItem[];
  settingsTabs: ExtensionSettingsTab[];
}
