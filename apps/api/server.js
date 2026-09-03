/**
 * Loudin API — Express server.
 *
 * Mounts the client (/api/*), internal platform-admin (/internal/*, aliased
 * under /api/*), and inbound webhook (/api/webhooks/*) routers on top of the
 * schema in apps/api/database/migrations/.
 */

require('dotenv').config({ path: __dirname + '/.env' });
require('./config/validateEnv'); // fail fast on missing/placeholder env

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const cookieParser = require('cookie-parser');
const http         = require('http');

const app    = express();
const server = http.createServer(app);   // wrapped for Socket.io
const PORT   = process.env.PORT || 3000;
const HOST   = process.env.HOST || '0.0.0.0';
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:8081';
const isProduction   = process.env.NODE_ENV === 'production';

// Trust the first proxy hop (Nginx on the same VM in production). Without
// this, express-rate-limit sees req.ip = 127.0.0.1 for every request and
// also throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR. 'loopback' restricts the
// trust to the local Nginx hop only — does NOT trust X-Forwarded-For from
// arbitrary upstream clients, so spoofing the IP from the public internet
// is still blocked.
app.set('trust proxy', 'loopback');

// ── Security & request middleware ─────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      frameSrc:   ["'self'"],
      connectSrc: ["'self'", ALLOWED_ORIGIN],
      imgSrc:     ["'self'", 'data:', 'https:'],
      styleSrc:   ["'self'", "'unsafe-inline'"],
    },
  },
  hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  frameguard:     { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
app.use(morgan(isProduction ? 'combined' : 'dev'));

// Webhook endpoints need raw body for HMAC verification — register the
// raw parser BEFORE express.json() so the Simkura receiver gets the exact
// bytes Simkura signed (see routes/webhooks.js).
app.use('/api/webhooks/simkura', express.raw({ type: 'application/json' }));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health / debug endpoints ──────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'loudin-api',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

// Simkura reachability (delegates to the integration client).
app.get('/api/health/simkura', async (req, res) => {
  try {
    const { client } = require('./hardware/simkura');
    if (!client.isAvailable()) {
      return res.status(200).json({ connected: false, reason: 'not_configured' });
    }
    const result = await client.ping();
    res.status(200).json({ connected: result.ok, ...result });
  } catch (err) {
    res.status(200).json({ connected: false, error: err.message });
  }
});

if (!isProduction) {
  app.get('/debug/cors', (req, res) => {
    res.status(200).json({
      cors_origin_env: process.env.CORS_ORIGIN || '(unset)',
      frontend_url:    process.env.FRONTEND_URL || '(unset)',
      request_origin:  req.get('origin')        || '(no origin header)',
    });
  });
}

// Public instance config — unauthenticated on purpose. The login/signup
// pages read this before any session exists (e.g. to render the
// "invite-only instance" state when signups are closed). Keep it minimal:
// only settings that are safe to show the whole internet belong here.
app.get('/api/config', async (req, res) => {
  try {
    const { signupsEnabled } = require('./services/platform/instanceSettings');
    res.json({ signups_enabled: await signupsEnabled() });
  } catch (err) {
    // DB unreachable — report defaults rather than 500ing the login page.
    console.error('[config] falling back to defaults:', err.message);
    res.json({ signups_enabled: true });
  }
});

// Root index — useful for confirming the server is up.
app.get('/api', (req, res) => {
  res.json({
    service: 'loudin-api',
    health: '/health',
    simkura_health: '/api/health/simkura',
    auth: '/api/auth',
  });
});

// ── Client routes (/api/*) — consumed by the React frontend ──────────────
app.use('/api/auth',          require('./routes/client/auth'));
app.use('/api/me',            require('./routes/client/me'));
app.use('/api/workspace',     require('./routes/client/workspace'));
app.use('/api/people',        require('./routes/client/people'));
app.use('/api/people-groups', require('./routes/client/peopleGroups'));
app.use('/api/credentials',   require('./routes/client/credentials'));
app.use('/api/devices',       require('./routes/client/devices'));
app.use('/api/features',      require('./routes/client/features'));
app.use('/api/reseller',      require('./routes/client/reseller'));

// ── Internal routes (/internal/*) — platform-admin only, firewallable ────
app.use('/internal/platform',  require('./routes/internal/platform'));
app.use('/internal/companies', require('./routes/internal/companies'));
app.use('/internal/audit',     require('./routes/internal/audit'));

// The platform-admin routers are also exposed under /api/* for the browser
// admin UI — frontend services call /api/platform, /api/companies, etc.
// (the /internal/* mounts above are the firewallable alias for internal
// tooling). Same routers, same authenticate + requirePlatformAdmin gates;
// mounting both is purely about reachability.
app.use('/api/platform',  require('./routes/internal/platform'));
app.use('/api/companies', require('./routes/internal/companies'));
app.use('/api/audit',     require('./routes/internal/audit'));

// ── External API (/api/external/*) — API-key auth, no session ─────────────────
app.use('/api/external', require('./routes/external'));

// ── Inbound webhooks (/api/webhooks/*) — signature-verified, no session ───────
app.use('/api/webhooks', require('./routes/webhooks'));

// ── 404 + error handler ───────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
});

app.use((err, req, res, _next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(!isProduction && { stack: err.stack }),
  });
});

// ── Lazy-loaded integrations ──────────────────────────────────────────────

let socketManager, simkuraDiscoveryWorker, simkuraStateSyncWorker;
try {
  simkuraDiscoveryWorker  = require('./hardware/simkura/deviceDiscoveryWorker');
  simkuraStateSyncWorker  = require('./hardware/simkura/stateSyncWorker');
  socketManager = require('./services/websocket/socketManager');
} catch (err) {
  console.error('Warning: failed to load some services:', err.message);
}

function initializeWebSocket() {
  if (!socketManager) {
    console.log('ℹ️  Socket manager not available — skipping WebSocket initialization');
    return;
  }
  try {
    socketManager.initialize(server);
    console.log('✅ WebSocket (Socket.io) initialized');
  } catch (error) {
    console.error('❌ Error initializing WebSocket:', error.message);
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────
// Guard lets test files require this module to get the configured `app`
// without binding a port or starting background workers.

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`
╔════════════════════════════════════════╗
║   Loudin API                          ║
║   Environment: ${(process.env.NODE_ENV || 'development').padEnd(20)}║
║   Host: ${HOST.padEnd(31)}║
║   Port: ${PORT.toString().padEnd(31)}║
╚════════════════════════════════════════╝
  `);

    initializeWebSocket();

    // Load DB-backed integration overrides (platform_config), then rebuild
    // the Simkura singleton so it picks them up — it snapshots credentials
    // at construction, which happens before the DB read completes.
    require('./services/platform/integrationSettings').init()
      .then(() => require('./hardware/simkura').client.reconfigure())
      .catch((err) => console.error('[boot] integration settings load failed (env fallback in effect):', err.message));

    if (simkuraDiscoveryWorker) simkuraDiscoveryWorker.start();
    if (simkuraStateSyncWorker) simkuraStateSyncWorker.start();
  });
}

function shutdown(signal) {
  console.log(`\n${signal} received — closing HTTP server`);
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

module.exports = app;
