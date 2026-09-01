/**
 * /api/external API catalog.
 *
 * Single source of truth for the integration docs on the API access page.
 * Each entry is rendered as an expandable row inside its scope section.
 *
 * The catalog is intentionally minimal: `ping` is the only endpoint the
 * platform ships. The structure — API-key auth, scopes, this catalog, the
 * outbound webhook endpoints — is the extension point; build the endpoints
 * your integration actually needs rather than inheriting a speculative
 * surface. To add one:
 *
 *   1. Mount the route in apps/api/routes/external/ behind
 *      requireScope('<scope>').
 *   2. Add the scope to ALLOWED_SCOPES in apps/api/services/platform/apiKey.js
 *      and to SCOPE_DESCRIPTIONS below.
 *   3. Add its catalog entry here — in the same change, so the docs page
 *      never advertises something the API doesn't serve.
 *
 * Status:
 *   'live'    — wired up; integrators can call it today
 *   'planned' — contract is committed, route not yet wired. Useful so
 *               external teams can code against the spec while you build.
 *               Flip to 'live' the same commit you mount the route.
 *
 * Scope convention:
 *   - Group endpoints by scope, where scope = read:RESOURCE | write:RESOURCE
 *   - Break a single endpoint into its own scope only when it's meaningfully
 *     riskier than the rest of the resource's writes (e.g. devices:command).
 *   - `ping` is the one cross-cutting health-check scope.
 */

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
  'ping': 'Health-check the API key. Every key should be granted this so integrations can verify they\'re live.',
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
      scopes: ['ping'],
      time:   '2026-05-17T20:28:41.763Z',
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
