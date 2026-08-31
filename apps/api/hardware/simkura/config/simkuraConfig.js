/**
 * Simkura API configuration.
 *
 * Connection values resolve through the platform integration settings
 * (services/platform/integrationSettings.js): a platform_config row set
 * from the admin UI wins, env vars are the fallback.
 *
 * Auth — static API key sent as a Bearer token:
 *   api_key / SIMKURA_API_KEY (alias SIMKURA_CORE_API_KEY)
 *
 * Other:
 *   api_url / SIMKURA_API_URL (alias SIMKURA_CORE_URL)
 *   SIMKURA_API_TIMEOUT  Request timeout in ms (default 10000, env-only)
 *
 * NOTE: properties are getters so they always reflect the current settings
 * cache — but SimkuraClient snapshots them at construction. After changing
 * settings at runtime, call client.reconfigure() (the integrations
 * controller does this on save).
 */

const settings = require('../../../services/platform/integrationSettings');

const config = {
  get apiUrl() { return settings.get('simkura', 'api_url'); },
  get apiKey() { return settings.get('simkura', 'api_key'); },

  get timeout() {
    return parseInt(
      process.env.SIMKURA_API_TIMEOUT
        || process.env.SIMKURA_CORE_TIMEOUT,
      10,
    ) || 10000;
  },

  /** True when enough credentials exist to make requests. */
  isConfigured() {
    return !!(this.apiUrl && this.apiKey);
  },

  /** Throws if the minimum required config is absent. */
  validate() {
    if (!this.apiUrl) {
      throw new Error('Simkura: SIMKURA_API_URL is not set');
    }
    if (!this.apiKey) {
      throw new Error('Simkura: SIMKURA_API_KEY is not set');
    }
    return true;
  },
};

module.exports = config;
