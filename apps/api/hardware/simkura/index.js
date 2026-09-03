/**
 * Simkura integration entry point.
 *
 * Usage (default singleton, uses SIMKURA_API_URL / SIMKURA_API_KEY):
 *   const simkura = require('./hardware/simkura');
 *   await simkura.client.unlockDoor(hardwareDeviceId);
 *
 * Usage (alternate credentials — e.g. a second Simkura account):
 *   const { SimkuraClient } = require('./hardware/simkura');
 *   const client = new SimkuraClient({ apiUrl, apiKey });
 */

const client = require('./simkuraClient');
const config = require('./config/simkuraConfig');
const { SimkuraClient, upstreamErrorMessage } = client;

module.exports = {
  client,           // singleton instance
  SimkuraClient,    // class for alternate-credential instances
  upstreamErrorMessage, // human-readable message from a Simkura error response
  config,
};
