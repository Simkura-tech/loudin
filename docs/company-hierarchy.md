# The Company Hierarchy — an Integrator's Guide

Loudin is multi-tenant with three company tiers. If you're a software
provider or security integrator deploying this for your customers, **you are
the platform** — this page explains what that means and how the tiers map to
a real business.

```
Platform (you)
├── End-user companies          ← your direct customers
└── Resellers (optional)        ← your dealer/partner channel
    └── End-user companies      ← customers a reseller brought in
```

## The three tiers

| Tier (`companies.company_type`) | Who it is | What their admins see |
|---|---|---|
| `platform` | The operator of the install — you | Everything: the company directory, full device fleet, integrations, API keys, webhooks, audit log — plus People / own-company Devices, so the platform can manage doors of its own |
| `reseller` | A partner who onboards customers for you | Their own company plus the end-user companies linked to them: customer list, invite links, their customers' devices |
| `end_user` | A company that owns and uses locks | Only their own workspace: their people, credentials, devices, schedules, events |

There is no separate role table for these tiers. A user is either an
**Admin** or a regular **User** (`user_type_id` 1 or 2), and what *kind* of
admin they are comes from their company's `company_type`. Permission checks
therefore combine both: an Admin at a reseller sees reseller surfaces; the
same Admin role at an end-user company sees only that workspace.

## Users vs. people

The two directories are deliberately separate:

- **`users`** — software logins. Admins and staff who sign into the web app.
- **`people`** — door-access credential holders: employees, cleaners,
  contractors who hold a PIN or card but never log into anything.

Your customers' employees are almost all *people*, not users. A typical
end-user company has one or two users (the office manager) and dozens of
people.

## How end-user companies arrive

Three onboarding paths, all landing in the same place:

1. **Self-signup** (`/signup`) — open registration, if `SIGNUPS_ENABLED`
   allows it. The company arrives unattached to any reseller.
2. **Reseller invite link** — a reseller shares their invite URL; companies
   registering through it are attached to that reseller **at creation**
   (`parent_company_id`, with `parent_locked_at` stamping when).
3. **Created by you** — platform admins can create companies directly from
   the Directory.

The reseller link is one-shot: once an end-user company is attached to a
reseller it stays attached (an unattached company can also link itself to a
reseller later, once). This protects the channel — a reseller's customer
can't silently migrate to another reseller's book.

Closing open signup (`SIGNUPS_ENABLED=false` or the bootstrap's
`--shape own-doors`) disables path 1 only — invite links keep working, so an
invite-only instance still onboards through its channel.

## What resellers are for

Resellers exist so you can run a **dealer channel** without giving partners
platform access:

- They onboard customers with their invite link and see their own customer
  list — nobody else's.
- Their customers' devices are visible to them for support.
- The schema reserves per-reseller Simkura credentials
  (`companies.simkura_api_key` / `simkura_api_url`) so a reseller's devices
  can route through their own Simkura account; in the current release all
  device traffic uses the platform credentials (roadmap — see
  [integrations/simkura.md](./integrations/simkura.md)).

If you have no channel, skip the tier entirely — nothing requires it.

## Devices and ownership

Devices belong to exactly one company (`devices.company_id`), or to the
**unclaimed pool** (`NULL`) before anyone claims them. Any company —
end-user, reseller, or the platform itself — claims devices the same way
(search by serial suffix, claim, push credentials). Releasing a device
returns it to the pool without touching the hardware. See
[integrations/simkura.md](./integrations/simkura.md) for the full lifecycle.

The platform company managing its own devices is what makes the
single-company deployment shape work with zero special casing — see
[deployment-shapes.md](./deployment-shapes.md).

## Mapping to your business

- **Solo integrator, direct customers** — you're the platform; each customer
  is an end-user company; no resellers. Onboard by invite or open signup.
- **Distribution model** — you're the platform; your dealers are resellers;
  their customers arrive through dealer invite links and stay attributed to
  the dealer.
- **Single company, own doors** — one platform company, nobody else; the
  multi-tenant machinery idles until you add a second company. Bootstrap
  with `--shape own-doors`.

Rebrand the whole thing as yours via [white-label.md](./white-label.md);
subscribe external systems (CRM, billing, monitoring) to company and device
lifecycle events via [integrations/webhooks.md](./integrations/webhooks.md).
