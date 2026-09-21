/**
 * Extension loader — the seam for code that lives on top of Loudin.
 *
 * An extension is a subdirectory of this folder with an index.js. Loudin
 * ships none; a fork or deployment adds its own (billing, a storefront, an
 * ERP sync, …) without editing any core file, so upstream merges stay
 * conflict-free. This file and README.md are the only upstream-owned files
 * in here — everything in a subdirectory is yours.
 *
 * An extension's index.js may export any of:
 *
 *   preBody(app, express)   Runs BEFORE the JSON body parser. For webhook
 *                           receivers that must see the raw signed bytes.
 *   routes(app)             Runs after the core routers are mounted and
 *                           before the 404 handler.
 *   authGate(req, res, next)
 *                           Express middleware run after every successful
 *                           authenticate(). req.user is populated. Respond
 *                           to block the request, or call next().
 *   start({ server })       Runs once at boot (not under test) — start
 *                           background workers here.
 *
 * SQL files in <extension>/migrations/ are run by database/scripts/migrate.js
 * after the core migrations and recorded as "<extension>/<file>", so their
 * numbering never collides with core's.
 *
 * See docs/extensions.md.
 */

const fs   = require('fs');
const path = require('path');

let loaded = [];

// EXTENSIONS_DIR lets tests (and unusual deployments) point at another folder.
function extensionsDir() {
  return process.env.EXTENSIONS_DIR
    ? path.resolve(process.env.EXTENSIONS_DIR)
    : __dirname;
}

/**
 * List extensions on disk without loading their code — migrate.js uses this
 * so running migrations never needs an extension's runtime dependencies.
 */
function discover(dir = extensionsDir()) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, dir: path.join(dir, entry.name) }))
    .filter((ext) => fs.existsSync(path.join(ext.dir, 'index.js')))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Require every extension. A failure here is deliberately fatal: booting
 * with a half-loaded extension (say, billing without its webhook receiver)
 * is worse than not booting.
 */
function load(dir = extensionsDir()) {
  loaded = discover(dir).map((ext) => ({ ...ext, hooks: require(ext.dir) }));
  for (const ext of loaded) console.log(`🧩 Extension loaded: ${ext.name}`);
  return loaded;
}

function preBody(app, express) {
  for (const ext of loaded) ext.hooks.preBody?.(app, express);
}

function routes(app) {
  for (const ext of loaded) ext.hooks.routes?.(app);
}

function start(context) {
  for (const ext of loaded) ext.hooks.start?.(context);
}

/** Run each extension's authGate in order; any gate may end the request. */
function runAuthGates(req, res, next) {
  const gates = loaded.map((ext) => ext.hooks.authGate).filter(Boolean);
  let i = 0;
  const step = (err) => {
    if (err) return next(err);
    const gate = gates[i++];
    if (!gate) return next();
    try {
      return Promise.resolve(gate(req, res, step)).catch(next);
    } catch (e) {
      return next(e);
    }
  };
  return step();
}

module.exports = { discover, load, preBody, routes, start, runAuthGates };
