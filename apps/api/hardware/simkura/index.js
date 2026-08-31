/**
 * Simkura integration entry point.
 *
 * Usage (default singleton, uses SIMKURA_API_URL / SIMKURA_API_KEY):
 *   const simkura = require('./hardware/simkura');
 *   await simkura.client.publishCommand(hardwareDeviceId, 'bwUnlock', {});
 *
 * Usage (per-reseller credentials):
 *   const { SimkuraClient } = require('./hardware/simkura');
 *   const client = new SimkuraClient({
 *     apiUrl: company.simkura_api_url,
 *     apiKey: company.simkura_api_key,
 *   });
 */

const client = require('./simkuraClient');
const config = require('./config/simkuraConfig');
const { SimkuraClient } = client;

module.exports = {
  client,           // singleton instance
  SimkuraClient,    // class for per-reseller instances
  config,
};
