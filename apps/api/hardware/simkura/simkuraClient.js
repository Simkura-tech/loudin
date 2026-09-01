/**
 * Simkura REST API client.
 *
 * Outbound surface (kept narrow on purpose):
 *   - Device reads       (v2: GET /api/v2/devices, GET /api/v2/devices/:id —
 *                         state is embedded in the resource; there is no
 *                         separate /state endpoint in v2)
 *   - Device commands    (still v1: POST /api/v1/devices/:hwId/commands —
 *                         migrates to the v2 resource-style command endpoints
 *                         once the v2 command surface leaves draft)
 *   - Webhook management (v1 CRUD + test + secret rotation + deliveries;
 *                         /v2/webhooks is not drafted yet)
 *
 * Contract source: simkura-core/api/openapi/v2.yaml (docs.simkura.com).
 *
 * Auth: a static API key sent as a Bearer token on every request.
 * The public sandbox key (sk_demo_simkura_sandbox) is v2-only and read-only.
 *
 * Use the singleton (env-var credentials) for the default case:
 *   const simkura = require('./hardware/simkura');
 *   await simkura.client.publishCommand(hwId, 'bwUnlock', {});
 *
 * Or instantiate per-reseller:
 *   const { SimkuraClient } = require('./hardware/simkura');
 *   const client = new SimkuraClient({ apiUrl, apiKey });
 */

'use strict';

const axios = require('axios');
const defaultConfig = require('./config/simkuraConfig');

const API_V1 = '/api/v1';
const API_V2 = '/api/v2';

/**
 * Flatten a v2 list item (the "spine": meta + device + capabilities) into
 * the shape our callers consume. `raw` keeps the original for anything else.
 */
function normalizeSpine(item) {
  const id = item?.device?.id;
  if (!id) return null;
  return {
    device_id:        id,
    device_type:      typeof item.device.board === 'string' && item.device.board.trim()
                        ? item.device.board.trim().toLowerCase()
                        : 'sb6',
    firmware_version: item.device.firmware ?? null,
    status:           item.meta?.status ?? null,       // 'online'|'offline'|'unknown'
    last_seen:        item.meta?.lastSeen ?? null,
    deployed:         item.meta?.deployed ?? null,
    capabilities:     Array.isArray(item.capabilities) ? item.capabilities : [],
    raw:              item,
  };
}

const RETRY = {
  maxAttempts:  parseInt(process.env.SIMKURA_RETRY_MAX_ATTEMPTS, 10)  || 3,
  baseDelayMs:  parseInt(process.env.SIMKURA_RETRY_BASE_DELAY_MS, 10) || 1000,
  maxDelayMs:   parseInt(process.env.SIMKURA_RETRY_MAX_DELAY_MS, 10)  || 8000,
  jitterMs:     parseInt(process.env.SIMKURA_RETRY_JITTER_MS, 10)     || 500,
};

function shouldRetry(error) {
  if (!error.response) return true;           // network / timeout
  return error.response.status >= 500;        // server error
}

function backoffDelay(attempt) {
  const exp = Math.min(RETRY.baseDelayMs * Math.pow(2, attempt), RETRY.maxDelayMs);
  return exp + Math.random() * RETRY.jitterMs;
}

class SimkuraClient {
  /**
   * @param {Object} [options]
   * @param {string} [options.apiUrl]  - Base URL (else env)
   * @param {string} [options.apiKey]  - API key, sent as a Bearer token
   * @param {number} [options.timeout] - Request timeout ms
   */
  constructor(options = {}) {
    this._options = options;
    this._init();
  }

  /**
   * (Re)build this instance from its constructor options overlaid on the
   * current default config. Called by the constructor and by reconfigure()
   * — in-place so existing references to the singleton stay valid after a
   * settings change from the admin UI.
   */
  _init() {
    const options = this._options;
    this.apiUrl  = options.apiUrl  || defaultConfig.apiUrl;
    this.apiKey  = options.apiKey  || defaultConfig.apiKey;
    this.timeout = options.timeout || defaultConfig.timeout;

    if (!this.apiUrl || !this.apiKey) {
      this.client = null;
      return;
    }

    this.client = axios.create({
      baseURL: this.apiUrl,
      timeout: this.timeout,
      headers: { 'Content-Type': 'application/json' },
    });

    // Attach the API key as a Bearer token before every request.
    this.client.interceptors.request.use((config) => {
      config.headers['Authorization'] = `Bearer ${this.apiKey}`;
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const cfg = error.config || {};

        // Retry on 5xx / network errors with exponential backoff + jitter.
        cfg._retry = cfg._retry || 0;
        if (shouldRetry(error) && cfg._retry < RETRY.maxAttempts) {
          cfg._retry += 1;
          const delay = backoffDelay(cfg._retry - 1);
          console.warn(`[simkura] retry ${cfg._retry}/${RETRY.maxAttempts} in ${Math.round(delay)}ms — ${error.message}`);
          await new Promise(r => setTimeout(r, delay));
          return this.client(cfg);
        }

        if (!error.response || error.response.status >= 500) {
          console.error(`[simkura] request failed (${this.apiUrl}):`, error.message);
          if (error.response) {
            console.error('[simkura] response:', error.response.status, error.response.data);
          }
        }
        throw error;
      },
    );
  }

  /** True when this instance has credentials and a base URL. */
  isAvailable() {
    return !!this.client;
  }

  /**
   * Re-resolve credentials from the current default config and rebuild the
   * axios instance + token cache. Call after integration settings change.
   */
  reconfigure() {
    this._init();
  }

  /**
   * Cheap reachability + auth probe: fetch one page of one device. Returns
   * { ok, latency_ms } or { ok: false, status?, error }. Never throws.
   */
  async ping() {
    if (!this.isAvailable()) return { ok: false, error: 'not_configured' };
    const started = Date.now();
    try {
      await this.client.get(`${API_V2}/devices`, { params: { limit: 1, page: 1 } });
      return { ok: true, latency_ms: Date.now() - started };
    } catch (err) {
      return {
        ok: false,
        latency_ms: Date.now() - started,
        status: err.response?.status ?? null,
        error:  err.response?.data?.error || err.message,
      };
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Devices
  // ──────────────────────────────────────────────────────────────────────

  /**
   * List every device registered in Simkura for the configured account,
   * paginating internally so the caller gets the full set. Items are
   * normalized v2 spines — see normalizeSpine() for the shape.
   * @returns {Promise<{devices: Array, total: number}>}
   */
  async getDevices() {
    const PAGE = 100;
    const first = await this.client.get(`${API_V2}/devices`, { params: { limit: PAGE, page: 1 } });
    const total = first.data.total ?? (first.data.devices?.length ?? 0);
    const items = [...(first.data.devices || [])];

    // Guard against endpoints that ignore pagination params (the sandbox
    // does): stop as soon as a page comes back empty or repeats.
    const pages = Math.ceil(total / PAGE);
    for (let p = 2; p <= pages && items.length < total; p++) {
      const r = await this.client.get(`${API_V2}/devices`, { params: { limit: PAGE, page: p } });
      const batch = r.data.devices || [];
      if (batch.length === 0) break;
      items.push(...batch);
    }

    const devices = items.map(normalizeSpine).filter(Boolean);
    return { devices, total };
  }

  /**
   * Fetch a single device's full v2 resource — the capability-vocabulary
   * shape: { meta, device, capabilities, doors[], power?, connectivity? }.
   * State is embedded (v2 has no separate /state endpoint); this payload is
   * what stateSyncWorker mirrors into our `devices` row.
   *
   * @param {string} hardwareDeviceId - Canonical device id (`device.id`,
   *   e.g. "nrf-352656…"). Opaque string; matches the id in URLs and webhooks.
   */
  async getDevice(hardwareDeviceId) {
    const r = await this.client.get(`${API_V2}/devices/${hardwareDeviceId}`);
    return r.data;
  }

  /**
   * v1 compatibility alias — v2 embeds state in the device resource, so
   * "state" and "device" are the same fetch now.
   */
  async getDeviceState(hardwareDeviceId) {
    return this.getDevice(hardwareDeviceId);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Commands  (POST /api/v1/devices/:hardwareDeviceId/commands)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Send a command. Simkura responds asynchronously via webhook — this
   * call returns once the command is accepted by Simkura.
   */
  async publishCommand(hardwareDeviceId, command, payload = {}) {
    const r = await this.client.post(
      `${API_V1}/devices/${hardwareDeviceId}/commands`,
      { command, payload },
    );
    return r.data;
  }

  /**
   * List a device's recent command-queue rows from Simkura.
   *
   * Each row: { id, device_id, command_type, payload, priority,
   *   status: 'pending'|'processing'|'sent'|'failed'|'cancelled',
   *   attempts, max_attempts, sent_at, error_message, created_at, ... }
   *
   * Sleeping devices hold 'pending' rows until their next wake, so this is
   * the pre-flight check before a provisioning push: pending rebuild
   * commands mean a previous push hasn't reached the device yet.
   *
   * @param {string} hardwareDeviceId
   * @param {Object} [params] - { since: ISO timestamp, limit }
   * @returns {Promise<Array>} queue rows (newest first)
   */
  async getDeviceQueue(hardwareDeviceId, params = {}) {
    const r = await this.client.get(
      `${API_V1}/devices/${hardwareDeviceId}/queue`,
      { params },
    );
    return r.data?.commands ?? [];
  }

  // ──────────────────────────────────────────────────────────────────────
  // Webhook management  (POST/GET/PUT/DELETE /api/v1/webhooks[/...])
  //
  // Loudin registers ONE webhook against the platform's Simkura account
  // pointing at /api/webhooks/simkura. Per-reseller webhooks (when a
  // reseller has their own Simkura credentials on companies.simkura_api_key)
  // are registered through a separate SimkuraClient instance.
  // ──────────────────────────────────────────────────────────────────────

  async listWebhooks() {
    const r = await this.client.get(`${API_V1}/webhooks`);
    if (Array.isArray(r.data)) return r.data;
    if (Array.isArray(r.data?.webhooks)) return r.data.webhooks;
    return [];
  }

  async getWebhook(id) {
    const r = await this.client.get(`${API_V1}/webhooks/${id}`);
    return r.data?.webhook ?? r.data;
  }

  /**
   * Register a new webhook. The response includes the HMAC secret —
   * Simkura only shows it on creation, capture and persist it immediately.
   */
  async createWebhook(cfg) {
    const r = await this.client.post(`${API_V1}/webhooks`, cfg);
    return r.data?.webhook ?? r.data;
  }

  async updateWebhook(id, patch) {
    const r = await this.client.put(`${API_V1}/webhooks/${id}`, patch);
    return r.data?.webhook ?? r.data;
  }

  async deleteWebhook(id) {
    await this.client.delete(`${API_V1}/webhooks/${id}`);
    return { success: true };
  }

  async testWebhook(id) {
    const r = await this.client.post(`${API_V1}/webhooks/${id}/test`);
    return r.data;
  }

  async regenerateWebhookSecret(id) {
    const r = await this.client.post(`${API_V1}/webhooks/${id}/regenerate-secret`);
    return r.data?.webhook ?? r.data;
  }

  async getWebhookDeliveries(id, params = {}) {
    const r = await this.client.get(`${API_V1}/webhooks/${id}/deliveries`, { params });
    return r.data;
  }
}

// Singleton using env-var credentials.
const client = new SimkuraClient();

module.exports = client;
module.exports.SimkuraClient = SimkuraClient;
module.exports.normalizeSpine = normalizeSpine; // exported for tests
