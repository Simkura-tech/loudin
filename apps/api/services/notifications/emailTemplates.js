/**
 * Email templates — HTML + plaintext bodies for transactional sends.
 *
 * Kept minimal and self-contained (no template engine dependency). Each
 * exported builder returns { subject, text, html } so the notifier can
 * pass them straight into Resend.
 *
 * Design notes:
 *   * Inline styles only — most clients strip <style> blocks.
 *   * Table-based layout for Outlook compatibility.
 *   * Single brand color, generous line height, big readable code.
 *   * No remote images — avoids the "click to load images" prompt that
 *     hides the code below the fold.
 */

const BRAND_COLOR = '#0f172a';     // slate-900
const ACCENT      = '#2563eb';     // blue-600
const TEXT_DIM    = '#475569';     // slate-600
const TEXT_FAINT  = '#94a3b8';     // slate-400
const BORDER      = '#e2e8f0';     // slate-200

function shell({ preheader, bodyHtml }) {
  // Preheader sits hidden at the top but appears as the email-list snippet.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Loudin</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${BRAND_COLOR};">
  <div style="display:none;font-size:1px;color:#f1f5f9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="max-width:520px;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">
        <tr><td style="padding:24px 28px 8px;">
          <div style="font-size:18px;font-weight:700;letter-spacing:-0.02em;color:${BRAND_COLOR};">Loudin</div>
        </td></tr>
        <tr><td style="padding:8px 28px 28px;font-size:15px;line-height:1.6;color:${BRAND_COLOR};">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid ${BORDER};font-size:12px;color:${TEXT_FAINT};">
          Loudin · cellular-connected access control.<br>
          If you didn't request this email, you can safely ignore it.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function codeBlockHtml(code) {
  return `<div style="margin:20px 0;padding:16px 20px;border:1px solid ${BORDER};border-radius:10px;background:#f8fafc;text-align:center;">
    <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:30px;letter-spacing:0.32em;font-weight:700;color:${BRAND_COLOR};">${escapeHtml(code)}</div>
  </div>`;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const COPY = {
  login_2fa: {
    subject:   'Your Loudin sign-in code',
    preheader: 'Enter this code to finish signing in.',
    intro:     'Use this code to finish signing in to Loudin:',
    footer:    'This code expires in 10 minutes. If you didn\'t try to sign in, you can ignore this email.',
  },
  password_reset: {
    subject:   'Reset your Loudin password',
    preheader: 'Enter this code to set a new password.',
    intro:     'Use this code to reset your Loudin password:',
    footer:    'This code expires in 10 minutes. If you didn\'t request a reset, ignore this email — your password stays unchanged.',
  },
  verify_email: {
    subject:   'Verify your email — Loudin',
    preheader: 'Confirm this email address on your Loudin account.',
    intro:     'Enter this code to confirm your email address on Loudin:',
    footer:    'This code expires in 10 minutes. If you didn\'t enable email verification, ignore this email.',
  },
  verify_phone: {
    // Email shouldn't see this purpose, but included for completeness.
    subject:   'Loudin verification code',
    preheader: 'Use this code to verify your account.',
    intro:     'Use this code to finish verifying your Loudin account:',
    footer:    'This code expires in 10 minutes.',
  },
};

/**
 * Build the email payload for an OTP. Returns { subject, text, html }.
 */
function otpEmail({ code, purpose }) {
  const c = COPY[purpose] || COPY.login_2fa;
  const html = shell({
    preheader: c.preheader,
    bodyHtml: `
      <p style="margin:0 0 8px;">${escapeHtml(c.intro)}</p>
      ${codeBlockHtml(code)}
      <p style="margin:0;color:${TEXT_DIM};font-size:13px;">${escapeHtml(c.footer)}</p>
    `,
  });
  const text = `${c.intro}\n\n    ${code}\n\n${c.footer}\n\n— Loudin`;
  return { subject: c.subject, text, html };
}

/**
 * Build the email payload for an ops alert.
 */
function opsAlertEmail({ subject, body }) {
  const html = shell({
    preheader: subject || 'Loudin operational alert',
    bodyHtml: `
      <p style="margin:0 0 8px;color:${TEXT_DIM};font-size:12px;letter-spacing:0.06em;text-transform:uppercase;font-weight:600;">Operations alert</p>
      <p style="margin:0 0 12px;font-weight:700;font-size:16px;">${escapeHtml(subject || '(no subject)')}</p>
      <pre style="margin:0;padding:14px 16px;border:1px solid ${BORDER};border-radius:10px;background:#f8fafc;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word;color:${BRAND_COLOR};">${escapeHtml(body || '')}</pre>
    `,
  });
  const text = `[Loudin ops alert] ${subject || '(no subject)'}\n\n${body || ''}\n`;
  return {
    subject: subject || '[Loudin] Ops alert',
    text,
    html,
  };
}

/**
 * Reseller customer invite — sent to a prospective end-user on the
 * reseller's behalf. The link carries the reseller's invite token, so
 * signing up through it attaches the new workspace to them automatically.
 */
function resellerInviteEmail({ resellerName, inviteUrl }) {
  const html = shell({
    preheader: `${resellerName} invited you to Loudin.`,
    bodyHtml: `
      <p style="margin:0 0 12px;">Hi,</p>
      <p style="margin:0 0 12px;"><strong>${escapeHtml(resellerName)}</strong> has invited you to create a workspace on Loudin — the platform for managing your cellular-connected door locks.</p>
      <p style="margin:0 0 20px;">Signing up through the button below connects your workspace to ${escapeHtml(resellerName)} automatically, so they can support your devices from day one.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 20px;">
        <tr><td style="border-radius:10px;background:${ACCENT};">
          <a href="${escapeHtml(inviteUrl)}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Create your account</a>
        </td></tr>
      </table>
      <p style="margin:0;color:${TEXT_DIM};font-size:13px;">Or paste this link into your browser:<br><a href="${escapeHtml(inviteUrl)}" style="color:${ACCENT};word-break:break-all;">${escapeHtml(inviteUrl)}</a></p>
    `,
  });
  const text = `${resellerName} has invited you to create a workspace on Loudin.\n\nSigning up through this link connects your workspace to ${resellerName} automatically:\n\n${inviteUrl}\n\n— the Loudin team`;
  return {
    subject: `${resellerName} invited you to Loudin`,
    text,
    html,
  };
}

module.exports = {
  otpEmail,
  opsAlertEmail,
  resellerInviteEmail,
};
