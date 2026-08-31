/**
 * /api/external API catalog.
 *
 * Single source of truth for the integration docs on the API access page.
 * Each entry is rendered as an expandable row inside its scope section.
 *
 * Status:
 *   'live'    — wired up; integrators can call it today
 *   'planned' — contract is committed, route not yet wired. Useful so
 *               external teams can code against the spec while we build.
 *               Flip to 'live' the same commit you mount the route.
 *
 * Convention reminder (see [[feedback-api-scope-convention]] when we write it):
 *   - Group endpoints by scope, where scope = read:RESOURCE | write:RESOURCE
 *   - Break a single endpoint into its own scope only when it's meaningfully
 *     riskier than the rest of the resource's writes (e.g. devices:command).
 *   - `ping` is the one cross-cutting health-check scope.
 */

import { branding } from '../../branding';

// Display-copy shorthand. API paths, scopes, header names, and key prefixes
// are protocol constants and intentionally do NOT use branding.
const brand = branding.productName;

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
export type EndpointStatus = 'live' | 'planned';

export interface ApiField {
  name: string;
  type: string;                       // 'string' | 'integer' | 'boolean' | "'a' | 'b'" | etc. (free text)
  required?: boolean;
  description: string;
}

export interface ApiEndpoint {
  method:  HttpMethod;
  path:    string;
  scope:   string;
  status:  EndpointStatus;
  summary: string;
  description: string;
  /** Path params, in order of appearance. */
  pathParams?:  ApiField[];
  /** Query string params. */
  queryParams?: ApiField[];
  /** Request body fields (POST/PATCH). */
  body?:        ApiField[];
  /** Example response body, displayed verbatim as JSON. */
  responseExample?: unknown;
  /** Notes that don't fit the other slots — rendered after the response. */
  notes?: string;
}

export const SCOPE_DESCRIPTIONS: Record<string, string> = {
  'ping':           'Health-check the API key. Every key should be granted this so integrations can verify they\'re live.',
  'read:companies': 'List companies (platform / reseller / end-user) and look up a specific dealer by code.',
  'read:devices':   'Read the platform fleet — every device across all tenants, plus per-device detail.',
  'read:support':   'List and read support tickets across the platform.',
  'write:support':  'Create and update support tickets on behalf of an integrating service.',
};

export const API_CATALOG: ApiEndpoint[] = [
  // ── ping (live) ────────────────────────────────────────────────────────────
  {
    method:  'GET',
    path:    '/api/external/ping',
    scope:   'ping',
    status:  'live',
    summary: 'Confirm the API key is valid.',
    description:
      'Returns metadata about the calling key — its name, prefix, and granted scopes. ' +
      'Use this from your integrating service\'s health probe to confirm the key still works.',
    responseExample: {
      ok:     true,
      name:   'Example integration (prod)',
      prefix: 'qcUDiaB1',
      scopes: ['ping', 'read:devices'],
      time:   '2026-05-17T20:28:41.763Z',
    },
  },

  // ── read:companies (planned) ───────────────────────────────────────────────
  {
    method:  'GET',
    path:    '/api/external/companies',
    scope:   'read:companies',
    status:  'planned',
    summary: 'List companies on the platform.',
    description:
      'Returns every active company. Filter by company_type to narrow to resellers, ' +
      'end-users, or the platform itself. Soft-deleted rows are excluded.',
    queryParams: [
      { name: 'company_type', type: "'platform' | 'reseller' | 'end_user'", description: 'Optional filter on company type.' },
      { name: 'limit',        type: 'integer',   description: 'Max rows per page (default 100, capped at 500).' },
      { name: 'offset',       type: 'integer',   description: 'Pagination offset.' },
    ],
    responseExample: {
      companies: [
        { id: 42, name: 'Acme Distribution', company_type: 'reseller', status: 'active',
          parent_company_id: null, created_at: '2026-04-12T18:01:09Z' },
      ],
      total:  1,
      limit:  100,
      offset: 0,
    },
  },
  // ── read:devices (planned) ─────────────────────────────────────────────────
  {
    method:  'GET',
    path:    '/api/external/devices',
    scope:   'read:devices',
    status:  'planned',
    summary: 'List the platform fleet.',
    description:
      'Returns every device across all tenants, merged with Simkura\'s upstream view. ' +
      'Filter by company_id to scope to a single tenant or by claim status to find ' +
      'unassigned devices.',
    queryParams: [
      { name: 'company_id', type: 'integer', description: 'Restrict to a single owning company.' },
      { name: 'claimed',    type: "'true' | 'false'", description: 'Filter on claim status.' },
      { name: 'limit',      type: 'integer', description: 'Max rows per page (default 100, capped at 500).' },
      { name: 'offset',     type: 'integer', description: 'Pagination offset.' },
    ],
    responseExample: {
      devices: [
        { hardware_device_id: '5042394b-3538-4587-80f6-252a16c75848',
          company_id: 88, company_name: 'Demo Customer Co',
          claimed: true, status: 'online', battery_percent: 87,
          last_seen: '2026-05-17T19:42:08Z' },
      ],
      total: 1, claimed_count: 1, unclaimed_count: 0,
    },
  },
  {
    method:  'GET',
    path:    '/api/external/devices/:hardware_device_id',
    scope:   'read:devices',
    status:  'planned',
    summary: 'Read one device by hardware id.',
    description:
      'Per [[feedback-device-id-canonical]], all device lookups use the hardware ' +
      'device_id (unique at the source), never the internal numeric PK or the ' +
      'Simkura UUID.',
    pathParams: [
      { name: 'hardware_device_id', type: 'string', required: true, description: 'The device\'s hardware serial id.' },
    ],
    responseExample: {
      device: { hardware_device_id: '5042394b-3538-4587-80f6-252a16c75848',
                device_name: 'Front Door', location: 'Main entrance',
                status: 'online', door_state: 'locked', door_override: false,
                battery_percent: 87, power_mode: 'deep_sleep',
                deep_sleep_duration_s: 3600,
                carrier: 'AT&T', signal_strength: -85, osdp_stage: 3,
                fw_counts: { credentials: 9, shifts: 2, holidays: 0, door_shifts: 1 },
                config_card_type: 1, latch_interval_s: 5,
                firmware_version: '1.4.2', last_seen: '2026-05-17T19:42:08Z',
                state_synced_at: '2026-05-17T19:40:00Z',
                company_id: 88, company_name: 'Demo Customer Co' },
      sync: { has_pending: false, credentials: { add: 0, remove: 0, total: 9 },
              shifts: { add: 0, remove: 0, total: 2 } },
    },
    notes:
      'door_override true means the door is pinned by a bwState command and its ' +
      'schedule is suspended. fw_counts are record counts as reported by the ' +
      'firmware itself (device-side truth); state_synced_at is when that snapshot ' +
      'was last refreshed. osdp_stage is the card-reader link (0=Root … 3=Connected). ' +
      'config_card_type: 0=26-bit Wiegand, 1=32-bit HID, 2=Mifare 1k. ' +
      'All richer-state fields are null until the device first reports them.',
  },

  // ── support (planned, both read and write) ─────────────────────────────────
  {
    method:  'POST',
    path:    '/api/external/support/tickets',
    scope:   'write:support',
    status:  'planned',
    summary: 'Submit a support ticket.',
    description:
      `Files a ticket against ${brand} support on behalf of a 3rd-party service. ` +
      'Use this to log issues from your CRM or external ticketing system into ' +
      `the ${brand} support queue.`,
    body: [
      { name: 'subject',     type: 'string', required: true, description: 'Short title for the ticket (1–200 chars).' },
      { name: 'body',        type: 'string', required: true, description: 'Full description / first comment.' },
      { name: 'priority',    type: "'low' | 'normal' | 'high' | 'urgent'", description: 'Defaults to normal.' },
      { name: 'company_id',  type: 'integer', description: `${brand} company this ticket is about (optional).` },
      { name: 'reporter_email', type: 'string', description: 'Email of the person who reported the issue (for replies).' },
      { name: 'external_ref',   type: 'string', description: 'Your system\'s reference id, stored for cross-referencing.' },
    ],
    responseExample: {
      ticket: { id: 1247, status: 'open', priority: 'normal',
                subject: 'Door lock not responding to bwUnlock',
                external_ref: 'CRM-T-99182',
                created_at: '2026-05-17T20:42:00Z' },
    },
  },
  {
    method:  'GET',
    path:    '/api/external/support/tickets',
    scope:   'read:support',
    status:  'planned',
    summary: 'List support tickets.',
    description:
      `Returns tickets in the ${brand} support inbox. Use external_ref to find a ` +
      'ticket you previously created, or status to scope to open / pending.',
    queryParams: [
      { name: 'status',       type: "'open' | 'pending' | 'closed'", description: 'Filter on ticket status.' },
      { name: 'external_ref', type: 'string',  description: 'Exact-match lookup by your system\'s reference id.' },
      { name: 'company_id',   type: 'integer', description: 'Restrict to tickets about one company.' },
      { name: 'limit',        type: 'integer', description: 'Max rows per page (default 50, capped at 200).' },
      { name: 'offset',       type: 'integer', description: 'Pagination offset.' },
    ],
    responseExample: {
      tickets: [
        { id: 1247, status: 'open', priority: 'normal',
          subject: 'Door lock not responding to bwUnlock',
          external_ref: 'CRM-T-99182',
          created_at: '2026-05-17T20:42:00Z',
          updated_at: '2026-05-17T20:42:00Z' },
      ],
      total: 1, limit: 50, offset: 0,
    },
  },
  {
    method:  'GET',
    path:    '/api/external/support/tickets/:id',
    scope:   'read:support',
    status:  'planned',
    summary: 'Read one support ticket, including its comments.',
    description: 'Returns the ticket header plus the full comment thread, oldest-first.',
    pathParams: [
      { name: 'id', type: 'integer', required: true, description: 'The ticket id returned at creation time.' },
    ],
    responseExample: {
      ticket: { id: 1247, status: 'open', priority: 'normal',
                subject: 'Door lock not responding to bwUnlock',
                body:    'Front door at Demo Customer Co stopped reacting to bwUnlock at 18:30.',
                external_ref: 'CRM-T-99182',
                company_id: 88, company_name: 'Demo Customer Co',
                created_at: '2026-05-17T20:42:00Z',
                comments: [
                  { id: 1, author: 'support-team', body: 'Looking into it.', created_at: '2026-05-17T20:55:00Z' },
                ] },
    },
  },
];

/**
 * Group catalog entries by scope. Returns scopes in a stable order:
 * ping first, then read:* alphabetical, then write:*.
 */
export function groupCatalogByScope(): Array<{ scope: string; endpoints: ApiEndpoint[] }> {
  const map = new Map<string, ApiEndpoint[]>();
  for (const ep of API_CATALOG) {
    if (!map.has(ep.scope)) map.set(ep.scope, []);
    map.get(ep.scope)!.push(ep);
  }
  const scopeRank = (s: string) =>
    s === 'ping'           ? 0
    : s.startsWith('read:')  ? 1
    : s.startsWith('write:') ? 2
    :                          3;
  return [...map.entries()]
    .sort(([a], [b]) => (scopeRank(a) - scopeRank(b)) || a.localeCompare(b))
    .map(([scope, endpoints]) => ({ scope, endpoints }));
}

/**
 * Build a curl example for the given endpoint. The base URL is injected
 * by the caller (we read window.location.origin on the page).
 */
export function curlFor(endpoint: ApiEndpoint, baseUrl: string, tokenPlaceholder = 'ldn_live_…'): string {
  const url = `${baseUrl}${endpoint.path}`;
  const auth = `-H "Authorization: Bearer ${tokenPlaceholder}"`;
  if (endpoint.method === 'GET' || endpoint.method === 'DELETE') {
    return `curl ${endpoint.method === 'DELETE' ? '-X DELETE ' : ''}${auth} \\\n     ${url}`;
  }
  // POST / PATCH — show a minimal body that matches the required fields.
  const sampleBody: Record<string, unknown> = {};
  for (const f of endpoint.body || []) {
    if (!f.required) continue;
    sampleBody[f.name] =
      f.type.includes("'")           ? f.type.split("|")[0].replace(/['\s]/g, '')
      : /int/i.test(f.type)          ? 0
      : /bool/i.test(f.type)         ? false
      : `<${f.name}>`;
  }
  const bodyJson = JSON.stringify(sampleBody, null, 2);
  return `curl -X ${endpoint.method} ${auth} \\\n     -H "Content-Type: application/json" \\\n     ${url} \\\n     -d '${bodyJson}'`;
}
