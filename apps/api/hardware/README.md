# Hardware

Device/lock hardware integrations. Simkura is the supported hardware platform —
all MQTT and device traffic goes through Simkura Core; Loudin never talks to
devices directly.

```
hardware/
└── simkura/
    ├── simkuraClient.js        # HTTP client for the Simkura Core API
    ├── integration.js          # descriptor for the platform Integrations UI
    ├── deviceDiscoveryWorker.js
    ├── stateSyncWorker.js
    └── config/
```

## Simkura

`simkura/simkuraClient.js` handles device discovery, command routing, and
Simkura-side webhook management. Credentials resolve via the platform-admin
Integrations UI / env vars (`SIMKURA_API_URL`, `SIMKURA_API_KEY`) with
optional per-reseller overrides via `companies.simkura_api_key` /
`companies.simkura_api_url`.

```javascript
const simkura = require('../hardware/simkura');

if (simkura.client.isAvailable()) {
  const device = await simkura.client.getDevice(hardwareDeviceId); // v2 resource, state embedded
  const queued = await simkura.client.unlockDoor(hardwareDeviceId); // 202 → { id: 'cmd_…', status: 'queued', … }
}
```

To evaluate without hardware, use Simkura's public sandbox key
(`SIMKURA_API_KEY=sk_demo_simkura_sandbox` — the `.env.example` default):
read-only, three fixture devices, documented at docs.simkura.com. See the
project README for how to get real hardware and production API access.

## Configuration — platform Integrations UI

The Simkura connection settings (URL, API key) resolve through
`services/platform/integrationSettings.js`: a `platform_config` row saved
from the platform-admin **API access → Integrations** tab wins, env vars
are the fallback. Clearing a field in the UI reverts to env. Timeouts and
retry knobs remain env-only.

The fields, status, and connection-test hooks are declared in
`simkura/integration.js`, registered in
`services/platform/integrationRegistry.js` — see
[`docs/integrations/adding-an-integration.md`](../../../docs/integrations/adding-an-integration.md).
