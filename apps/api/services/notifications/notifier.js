/**
 * Notifier — delivers OTPs and other transactional messages over email / SMS.
 *
 * Wired channels:
 *   - email  (Resend)           — placeholder env values fall back to a dev stub
 *   - sms    (Twilio)           — placeholder env values fall back to a dev stub
 *
 * In dev (or any env where the provider key is unset / still the
 * .env.example placeholder), `sendCode()` prints the code to the API console
 * with a clear [DEV] banner and returns { delivered: 'console' } so the
 * UI can hint to the user that the code is on the server log.
 *
 * Provider credentials resolve through the platform integration settings
 * (services/platform/integrationSettings.js) AT SEND TIME: a value saved
 * on the admin "API access → Integrations" tab (resend / twilio cards)
 * wins, env vars are the fallback. So dropping real RESEND_API_KEY /
 * TWILIO_* keys into apps/api/.env still works exactly as before — no
 * code changes required — and so does saving them from the UI.
 */

const templates = require('./emailTemplates');
const settings = require('../platform/integrationSettings');

const PLACEHOLDER_VALUES = new Set([
  undefined, null, '',
  're_your_resend_api_key',
  'TWILIO_ACCOUNT_SID_placeholder',
  'TWILIO_AUTH_TOKEN_placeholder',
]);

// settings.get returns the DB override, else the env var, else null —
// null and the .env.example placeholders both count as "not configured".
function resendApiKey()   { return settings.get('resend', 'api_key'); }
function twilioSid()      { return settings.get('twilio', 'account_sid'); }
function twilioToken()    { return settings.get('twilio', 'auth_token'); }
function twilioFrom()     { return settings.get('twilio', 'from_number'); }

function emailConfigured() {
  return !PLACEHOLDER_VALUES.has(resendApiKey());
}

function smsConfigured() {
  return !PLACEHOLDER_VALUES.has(twilioSid())
      && !PLACEHOLDER_VALUES.has(twilioToken())
      && !PLACEHOLDER_VALUES.has(twilioFrom());
}

// Cached per key so a key change from the admin UI rebuilds the client
// on the next send (with env-only config the key never changes and this
// behaves like a plain singleton).
let _resendClient = null;
let _resendClientKey = null;
function resendClient() {
  const key = resendApiKey();
  if (_resendClient && _resendClientKey === key) return _resendClient;
  const { Resend } = require('resend');
  _resendClient = new Resend(key);
  _resendClientKey = key;
  return _resendClient;
}

function fromAddress() {
  return settings.get('resend', 'from_address') || 'no-reply@example.com';
}

function purposeLabel(purpose) {
  switch (purpose) {
    case 'login_2fa':       return 'Loudin sign-in code';
    case 'password_reset':  return 'Loudin password reset code';
    case 'verify_email':    return 'Loudin email verification';
    case 'verify_phone':    return 'Loudin phone verification';
    default:                return 'Loudin verification code';
  }
}

function devLog({ channel, destination, code, purpose }) {
  const subject = purposeLabel(purpose);
  // eslint-disable-next-line no-console
  console.log(
    '\n' +
    '┌───────────────────────────────────────────────────────────┐\n' +
    '│  [DEV NOTIFIER]  ' + subject.padEnd(40) + '│\n' +
    '│  No ' + channel.padEnd(5) + ' provider configured — code logged here.       │\n' +
    '├───────────────────────────────────────────────────────────┤\n' +
    '│  to:    ' + destination.padEnd(50) + '│\n' +
    '│  code:  ' + code.padEnd(50) + '│\n' +
    '└───────────────────────────────────────────────────────────┘\n'
  );
}

async function sendEmailCode({ destination, code, purpose }) {
  if (!emailConfigured()) {
    devLog({ channel: 'email', destination, code, purpose });
    return { delivered: 'console' };
  }
  try {
    const { subject, text, html } = templates.otpEmail({ code, purpose });
    const { error } = await resendClient().emails.send({
      from:    fromAddress(),
      to:      destination,
      subject,
      text,
      html,
    });
    if (error) throw new Error(error.message || JSON.stringify(error));
    return { delivered: 'email' };
  } catch (err) {
    console.error('[notifier] email send failed; falling back to console log:', err.message);
    devLog({ channel: 'email', destination, code, purpose });
    return { delivered: 'console', error: err.message };
  }
}

async function sendSmsCode({ destination, code, purpose }) {
  if (!smsConfigured()) {
    devLog({ channel: 'sms', destination, code, purpose });
    return { delivered: 'console' };
  }
  try {
    const twilio = require('twilio');
    const client = twilio(twilioSid(), twilioToken());
    await client.messages.create({
      to:   destination,
      from: twilioFrom(),
      body: `${purposeLabel(purpose)}: ${code}. Expires in 10 minutes.`,
    });
    return { delivered: 'sms' };
  } catch (err) {
    console.error('[notifier] sms send failed; falling back to console log:', err.message);
    devLog({ channel: 'sms', destination, code, purpose });
    return { delivered: 'console', error: err.message };
  }
}

/**
 * Dispatch by channel. Returns { delivered: 'email'|'sms'|'console', … }.
 * 'console' means the provider isn't configured and the code is in the
 * API server log — callers can surface a hint to that effect in dev.
 */
async function sendCode({ channel, destination, code, purpose }) {
  if (channel === 'email') return sendEmailCode({ destination, code, purpose });
  if (channel === 'sms')   return sendSmsCode({   destination, code, purpose });
  throw new Error(`Unknown notifier channel: ${channel}`);
}

/**
 * Send a generic ops alert to the env-configured OPS_ALERT_EMAIL.
 * Used for events the Loudin team should see in their inbox (failed
 * dealer-code attempts, CRM connectivity loss, etc.).
 *
 * Returns { delivered: 'email' | 'console', error? } so callers can log
 * the outcome without throwing — alerts are best-effort and must not
 * fail the user-facing flow they're attached to.
 */
async function sendOpsAlert({ subject, body }) {
  const to = process.env.OPS_ALERT_EMAIL;
  if (!to) {
    console.warn('[notifier] sendOpsAlert: OPS_ALERT_EMAIL not set — alert dropped.');
    return { delivered: 'console', error: 'OPS_ALERT_EMAIL not configured' };
  }

  if (!emailConfigured()) {
    // eslint-disable-next-line no-console
    console.log(
      '\n' +
      '┌───────────────────────────────────────────────────────────┐\n' +
      '│  [DEV OPS ALERT]                                          │\n' +
      '│  Email provider not configured — alert logged here.       │\n' +
      '├───────────────────────────────────────────────────────────┤\n' +
      '│  to:      ' + to.padEnd(48) + '│\n' +
      '│  subject: ' + (subject || '(no subject)').slice(0, 48).padEnd(48) + '│\n' +
      '└───────────────────────────────────────────────────────────┘\n' +
      (body || '') + '\n'
    );
    return { delivered: 'console' };
  }

  try {
    const payload = templates.opsAlertEmail({ subject, body });
    const { error } = await resendClient().emails.send({
      from: fromAddress(),
      to,
      ...payload,
    });
    if (error) throw new Error(error.message || JSON.stringify(error));
    return { delivered: 'email' };
  } catch (err) {
    console.error('[notifier] sendOpsAlert failed:', err.message);
    return { delivered: 'console', error: err.message };
  }
}

/**
 * Send a templated transactional email. Used for non-OTP sends like the
 * reseller customer invite. Returns the same shape as sendCode/sendOpsAlert.
 *
 * @param {object} args
 * @param {string} args.to                    — destination email
 * @param {object} args.payload               — { subject, text, html } (use emailTemplates builders)
 * @param {string} [args.preheaderForDevLog]  — short summary for the dev console banner
 */
async function sendEmail({ to, payload, preheaderForDevLog }) {
  if (!to) return { delivered: 'console', error: 'no destination' };

  if (!emailConfigured()) {
    // eslint-disable-next-line no-console
    console.log(
      '\n' +
      '┌───────────────────────────────────────────────────────────┐\n' +
      '│  [DEV EMAIL]                                              │\n' +
      '│  Email provider not configured — payload logged here.     │\n' +
      '├───────────────────────────────────────────────────────────┤\n' +
      '│  to:       ' + to.padEnd(47).slice(0, 47) + '│\n' +
      '│  subject:  ' + (payload.subject || '(no subject)').padEnd(47).slice(0, 47) + '│\n' +
      (preheaderForDevLog
        ? '│  context:  ' + preheaderForDevLog.padEnd(47).slice(0, 47) + '│\n'
        : ''
      ) +
      '└───────────────────────────────────────────────────────────┘\n'
    );
    return { delivered: 'console' };
  }
  try {
    const { error } = await resendClient().emails.send({
      from: fromAddress(),
      to,
      ...payload,
    });
    if (error) throw new Error(error.message || JSON.stringify(error));
    return { delivered: 'email' };
  } catch (err) {
    console.error('[notifier] sendEmail failed:', err.message);
    return { delivered: 'console', error: err.message };
  }
}

module.exports = {
  sendCode,
  sendOpsAlert,
  sendEmail,
  emailConfigured,
  smsConfigured,
};
