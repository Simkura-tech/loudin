'use strict';

/**
 * Simkura Core integration descriptor.
 *
 * Registered in services/platform/integrationRegistry.js; the descriptor
 * contract is documented in docs/integrations/adding-an-integration.md.
 * Field values resolve through services/platform/integrationSettings.js
 * (platform_config override → env var → null) — this module only declares
 * the fields and provides status/test/reconfigure hooks.
 *
 * The simkura module is required lazily (inside the hooks, not at module
 * top) so loading the registry never pulls in the client/config chain
 * mid-load — simkuraConfig itself resolves through integrationSettings,
 * which lazily requires the registry.
 */

function simkura() {
  return require('./index');
}

module.exports = {
  name: 'simkura',
  label: 'Simkura Core (devices)',
  description:
    'Device commands, discovery, and webhook management all route through ' +
    'the Simkura Core REST API, authenticated with a static API key.',
  docsUrl: null,

  fields: [
    { field: 'api_url', secret: false, env: ['SIMKURA_API_URL', 'SIMKURA_CORE_URL'],     label: 'API base URL' },
    { field: 'api_key', secret: true,  env: ['SIMKURA_API_KEY', 'SIMKURA_CORE_API_KEY'], label: 'API key' },
  ],

  /** Cheap, synchronous. Extra string values are shown as pills in the admin UI. */
  status() {
    const { config } = simkura();
    return { configured: config.isConfigured() };
  },

  /** Live probe: one-device list call via the singleton client. Never throws. */
  async test() {
    const result = await simkura().client.ping();
    // ping() reports the unconfigured case via `error` — normalize to the
    // `reason` the UI knows how to phrase.
    if (!result.ok && result.error === 'not_configured') {
      return { ok: false, reason: 'not_configured' };
    }
    return result;
  },

  /**
   * The Simkura singleton snapshots credentials at construction — rebuild
   * it so settings saved from the admin UI take effect without a restart.
   */
  reconfigure() {
    simkura().client.reconfigure();
  },
};
