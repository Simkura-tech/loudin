# Extensions — building on top of Loudin

Loudin is meant to be forked and run as a product. The extension seam is how
you add what your business needs — billing, a storefront, a marketing site, an
ERP sync — **without editing core files**, so pulling upstream stays a clean
`git merge`.

The rule of thumb: if a change would be useful to every Loudin deployment,
send it upstream. If it's specific to your business, make it an extension.

Loudin ships with no extensions. Everything below is inert until you add one.

## Where things go

| You're adding | It goes in | Upstream ever touches it? |
|---|---|---|
| API routes, webhooks, workers | `apps/api/extensions/<name>/index.js` | No |
| Database tables | `apps/api/extensions/<name>/migrations/*.sql` | No |
| Pages, nav items, settings tabs | `apps/web/src/extensions/index.tsx` + subfolders | No (shipped empty, then left alone) |
| Product name, logos, emails | `apps/web/src/branding.ts` — see [white-label.md](./white-label.md) | No |

Upstream owns only `apps/api/extensions/index.js` (the loader),
`apps/web/src/extensions/types.ts`, and `renderRoutes.tsx`.

## API extensions

Create a folder with an `index.js`. Export whichever hooks you need:

```js
// apps/api/extensions/billing/index.js
const { authenticate } = require('../../middleware/core/auth');

module.exports = {
  // Before the JSON body parser — for webhooks signed over the raw bytes.
  preBody(app, express) {
    app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
  },

  // After core routes, before the 404 handler.
  routes(app) {
    app.use('/api/billing', authenticate, require('./routes'));
    app.post('/api/webhooks/stripe', require('./stripeWebhook'));
  },

  // After every successful authenticate(). Respond to block, or call next().
  async authGate(req, res, next) {
    if (await isLapsed(req.user.company_id)) {
      return res.status(402).json({ error: 'Payment Required', error_code: 'SUBSCRIPTION_LAPSED' });
    }
    return next();
  },

  // Once at boot. Not called under test.
  start({ server }) {
    require('./renewalWorker').start();
  },
};
```

Behaviour worth knowing:

- Extensions load in alphabetical order by folder name.
- Core routes mount first, so an extension cannot shadow a core path.
- A throw while loading an extension **aborts boot**. Running with half an
  extension (billing without its webhook receiver) is worse than not running.
- `authGate` runs for `authenticate`, not `optionalAuthenticate` — public
  endpoints are never gated. Keep gates fast; they run on every signed-in
  request. Exempt your own recovery paths (a lapsed tenant still needs to
  reach `/api/billing` to pay).
- `EXTENSIONS_DIR` points the loader at a different folder. The test suite
  uses it; you normally shouldn't.

### Migrations

Put `.sql` files in `apps/api/extensions/<name>/migrations/`. `npm run
db:migrate` runs all core migrations first, then each extension's, and records
them as `<name>/<file>` — so number them from `001` without worrying about
core's numbering, now or after future upstream merges.

Same rules as core migrations: never edit one after it has run (the runner
hashes them and reports drift); add a new file instead. Extension tables may
reference core tables; core never references yours.

Deleting an extension folder removes its code and stops its migrations from
being considered. It does not drop its tables — write that migration yourself
if you want them gone.

## Frontend extensions

Edit `apps/web/src/extensions/index.tsx` — the one file, like `branding.ts`:

```tsx
import { IconCreditCard } from '@tabler/icons-react';
import type { WebExtensions } from './types';
import MarketingLayout from './site/MarketingLayout';
import HomePage from './site/HomePage';
import PricingPage from './site/PricingPage';
import InvoicesPage from './billing/InvoicesPage';
import BillingSettings from './billing/BillingSettings';

export const extensions: WebExtensions = {
  // Replaces the default "/" → /login redirect.
  home: <MarketingLayout><HomePage /></MarketingLayout>,

  publicRoutes: [
    { path: '/pricing', element: <MarketingLayout><PricingPage /></MarketingLayout> },
  ],

  // Under /app: signed-in, inside the sidebar chrome. Paths are relative.
  appRoutes: [
    { path: 'invoices', element: <InvoicesPage /> },
  ],

  navItems: [
    {
      to: '/app/invoices',
      label: 'Invoices',
      icon: IconCreditCard,
      section: 'Billing',                              // platform sidebar heading
      visible: (user) => user.user_type_id === 1,      // admins only
    },
  ],

  settingsTabs: [
    { path: 'billing', label: 'Billing', element: <BillingSettings /> },
  ],
};
```

- `visible(user)` hides a nav item or tab; it is **not** access control.
  Enforce permissions in the API, as core does.
- Extension nav items are hidden while a platform admin is impersonating a
  customer, the same as Settings.
- Routes nest: give a route `children` and render an `<Outlet />` in its
  `element`; mark a default child with `index: true`.

## Keeping a fork mergeable

```bash
git remote add upstream https://github.com/simkura-tech/loudin.git
git remote set-url --push upstream DISABLED   # never push your fork upstream by accident
git fetch upstream && git merge upstream/main
```

If you find yourself editing a core file to make an extension work, that's a
missing hook — open an issue or a PR for the hook rather than carrying the
patch.
