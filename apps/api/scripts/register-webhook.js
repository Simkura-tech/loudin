#!/usr/bin/env node
/**
 * One-shot: register our /api/webhooks/simkura receiver with Simkura's
 * webhook service so device events flow in.
 *
 * Run from apps/api:
 *   node scripts/register-webhook.js
 *
 * To rotate the HMAC secret on an existing webhook:
 *   node scripts/register-webhook.js --regenerate
 *
 * Required env (apps/api/.env):
 *   SIMKURA_API_URL              base URL, e.g. https://api.simkura.com
 *   SIMKURA_API_KEY              bearer token
 *   SIMKURA_WEBHOOK_PUBLIC_URL   the URL Simkura will POST to,
 *                                e.g. https://api.example.com/api/webhooks/simkura
 *
 * What it does:
 *   1. Looks for an existing Simkura webhook pointing at our URL.
 *   2. If none, creates one (event filters empty → receive every event)
 *      with payload_version 'v2' — the versioned camelCase envelope and
 *      timestamp-bound signature the receiver is built for.
 *      If found and --regenerate, rotates the secret.
 *      An existing webhook still on payload_version 'v1' is flipped to
 *      'v2' (safe mid-flight: the receiver accepts both shapes/schemes,
 *      and Simkura signs retries by the shape they were enqueued with).
 *   3. Stores the Simkura webhook id in platform_config(simkura_webhook_id).
 *   4. Prints the secret. SIMKURA_WEBHOOK_SECRET in .env must match it
 *      for the receiver to verify signatures.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { client } = require('../hardware/simkura');
const { query, pool } = require('../database/db');

const PUBLIC_URL = process.env.SIMKURA_WEBHOOK_PUBLIC_URL;
const args = process.argv.slice(2);
const regenerate = args.includes('--regenerate');

async function setConfig(key, value) {
  await query(
    `INSERT INTO platform_config (key, value, updated_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [key, value]
  );
}

function printSecret(webhook) {
  console.log('');
  console.log('────────────────────────────────────────────────────────────');
  console.log(`Webhook id : ${webhook.id}`);
  console.log(`URL        : ${webhook.url}`);
  console.log(`Secret     : ${webhook.secret}`);
  console.log('────────────────────────────────────────────────────────────');
  console.log('Set SIMKURA_WEBHOOK_SECRET in apps/api/.env (and prod secrets)');
  console.log('to the secret above, then restart the api. The receiver will');
  console.log('reject every signed delivery until the secrets match.');
  console.log('');
}

(async () => {
  try {
    if (!PUBLIC_URL) {
      console.error('SIMKURA_WEBHOOK_PUBLIC_URL is required (the URL Simkura will POST to).');
      process.exit(1);
    }
    if (!client.isAvailable()) {
      console.error('Simkura client not configured — check SIMKURA_API_URL / SIMKURA_API_KEY.');
      process.exit(1);
    }

    console.log(`Looking up existing webhooks for URL ${PUBLIC_URL}…`);
    let list;
    try {
      list = await client.listWebhooks();
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        console.error('Simkura rejected the API key (HTTP ' + status + '). Check SIMKURA_API_KEY.');
      } else {
        console.error('Failed to list webhooks:', err.message);
      }
      process.exit(1);
    }

    const existing = list.find((w) => w.url === PUBLIC_URL);

    // Cutover: flip a pre-v2 registration to the v2 delivery contract.
    // Idempotent, and safe while v1 retries are still in flight — the
    // receiver verifies and parses both shapes.
    if (existing && existing.payload_version !== 'v2') {
      console.log(`Webhook #${existing.id} is on payload_version '${existing.payload_version ?? 'v1'}' — switching to 'v2'…`);
      await client.updateWebhook(existing.id, { payload_version: 'v2' });
      console.log('Switched to the v2 envelope + timestamp-bound signature.');
    }

    if (existing && !regenerate) {
      console.log(`Already registered as webhook #${existing.id} (active=${existing.is_active}).`);
      await setConfig('simkura_webhook_id', String(existing.id));
      console.log('Stored simkura_webhook_id in platform_config.');
      console.log('');
      console.log('NOTE: the secret is only shown when first created. If');
      console.log('SIMKURA_WEBHOOK_SECRET in .env is missing, rerun with --regenerate.');
      return;
    }

    let webhook;
    if (existing && regenerate) {
      console.log(`Rotating secret on webhook #${existing.id}…`);
      webhook = await client.regenerateWebhookSecret(existing.id);
    } else {
      console.log('Creating new webhook…');
      webhook = await client.createWebhook({
        name: 'Loudin receiver',
        url: PUBLIC_URL,
        payload_version: 'v2',    // versioned envelope + timestamp-bound signature
        event_types: [],          // empty = subscribe to all
        event_categories: [],
        device_ids: [],
        is_active: true,
        retry_on_failure: true,
        max_retries: 3,
        timeout_ms: 10000,
        description: 'Loudin device event receiver',
      });
    }

    if (!webhook?.id) {
      console.error('Simkura did not return a webhook id. Raw response:', webhook);
      process.exit(1);
    }
    if (!webhook.secret) {
      console.error('Simkura did not return a secret. Cannot continue — verify with Simkura support.');
      process.exit(1);
    }

    await setConfig('simkura_webhook_id', String(webhook.id));
    console.log('Stored simkura_webhook_id in platform_config.');
    printSecret(webhook);
  } finally {
    await pool.end();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
