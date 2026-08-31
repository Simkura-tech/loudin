# Middleware

Express middleware for authentication, authorization, and request security.

## Layout

```
middleware/
├── core/
│   ├── auth.js       # JWT authentication from the httpOnly cookie (or
│   │                 #   Authorization header fallback); sets req.user and,
│   │                 #   for impersonated sessions, req.impersonation
│   ├── rbac.js       # Role checks — requireAdmin, requirePlatformAdmin,
│   │                 #   requireCompanyType, USER_TYPES / COMPANY_TYPES
│   └── apiKeyAuth.js # `Authorization: Bearer ldn_live_…` auth for the
│                     #   /api/external/* service-to-service surface;
│                     #   sets req.api_client, plus requireScope(scope)
├── security/
│   └── rateLimiter.js  # IP- and account-based rate limiting on auth endpoints
├── utils/
│   └── context.js      # extractCompanyId / setCompanyContext helpers
└── websocket/
    └── socketAuth.js   # Socket.io connection auth (JWT from handshake/cookie)
```

## Typical chain

```javascript
const { authenticate } = require('../middleware/core/auth');
const { requireAdmin } = require('../middleware/core/rbac');

router.use(authenticate);                     // 1. Verify JWT, populate req.user
router.get('/unclaimed', requireAdmin, ...);  // 2. Role gate per route
```

Tenant scoping is not a separate middleware: controllers scope every query by
`req.user.company_id` (see the tenant-isolation tests in `test/`).

## Two distinct auth surfaces

- **Human sessions** — `core/auth.js` (cookie/JWT). Used by the web app.
- **API keys** — `core/apiKeyAuth.js` (`ldn_live_…` bearer tokens with scopes).
  Used only on `/api/external/*`. The two are intentionally incompatible: a
  leaked API key can never act as a logged-in user.
