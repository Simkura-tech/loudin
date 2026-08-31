# White-labeling the frontend

The web app is built to be re-branded by editing **one file** plus swapping a
few image files. No component code needs to change. The MIT license permits
proprietary, closed-source branded distributions — you may ship your branded
build to customers without publishing your changes.

## 1. Edit `apps/web/src/branding.ts`

This is the single source of truth for every brand string in the UI. It
exports a typed `branding` object:

| Field | Drives |
|---|---|
| `productName` | Nav wordmark (text-based — no logo image needed), browser-tab titles, auth pages, confirmation dialogs, API-docs prose, legal-document copy |
| `companyLegalName` | Footer copyright lines ("© 2026 …") |
| `tagline` | Default browser-tab title (`<productName> — <tagline>`) |
| `legalEmail` / `privacyEmail` | Contact addresses in the Terms of Service and Privacy Policy pages |
| `supportEmail` | Reserved for future support-contact surfaces (set it anyway) |
| `docsUrl` / `repoUrl` | Optional links (currently informational only) |
| `assets.icon` / `assets.navLogo` / `assets.thumbnail` | Canonical paths of the brand image files (see below) |

Every user-facing "Loudin" in `apps/web/src/` reads from this object
(including the legal placeholder copy in
`apps/web/src/pages/legal/legalContent.ts`, which template-interpolates
`branding.productName` and the contact emails).

## 2. Replace the logo files (keep the same paths)

| File | Current dimensions | Used for |
|---|---|---|
| `apps/web/public/icon-circle.png` | 512 × 512 PNG (transparent) | Favicon + apple-touch-icon (referenced from `index.html`) |
| `apps/web/public/logo-nav.png` | 1545 × 495 PNG | Horizontal logo, available for nav use (the default UI renders a **text** wordmark from `branding.productName` instead) |
| `apps/web/public/thumbnail.jpg` | 2000 × 2000 JPEG | Social-share / preview image |

Replace the files in place — the paths are referenced from `index.html` and
exported from `branding.ts` (`branding.assets`), so keeping the same
filenames means nothing else needs editing.

## 3. Edit `apps/web/index.html` (title fallback + social previews)

`index.html` cannot import TypeScript, so it ships a **neutral** fallback
title ("Access control"). The branded tab title is set at runtime by a
`document.title` effect in `apps/web/src/App.tsx` that reads `branding.ts`
(and `MarketingLayout` then sets per-page titles). This was chosen over a
Vite `define`/env indirection because it keeps all branding in one TS file
with zero build configuration; the neutral title is visible only for the
instant before the bundle loads.

The `og:` / `twitter:` meta tags are the one exception to "edit only
`branding.ts`": social crawlers don't execute JavaScript, so runtime branding
can never reach them. If you care about link previews, hand-edit the
`og:site_name`, `og:title`, `twitter:title`, and description tags in
`index.html`, and add an `og:image` pointing at an absolute URL of your
thumbnail.

## 4. Colors and typography

The theme system is untouched by branding — colors live in design tokens:

- `apps/web/src/theme/tokens/colors.ts` — palette and accent color (the
  indigo/blue primary)
- `apps/web/src/theme/tokens/typography.ts` — font stack (Inter is loaded
  via a `<link>` in `index.html`; change both together)
- `apps/web/src/theme/lightTheme.ts` / `darkTheme.ts` — semantic mappings

Also update `<meta name="theme-color">` in `index.html` if you change the
accent color.

## 5. Rebuild

```bash
cd apps/web
npm run build   # output in apps/web/dist/
```

## What is intentionally NOT rebranded

- **`X-Loudin-*` webhook headers and the `ldn_live_` key prefix** shown in
  the in-app API docs — these are the API's wire protocol (sent by
  `apps/api`), not display copy. Rebranding the docs without changing the
  backend would break integrators verifying signatures.
- **Package names** (`@loudin/web` in `package.json`) and internal
  identifiers (e.g. the `loudin.nameWorkspaceDismissed` sessionStorage
  key) — never user-visible; renaming them buys nothing.
- **`apps/web/src/branding.ts` defaults** — the upstream defaults live there
  by design; that's the file you edit.
