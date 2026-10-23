# The Company Hierarchy — an Integrator's Guide

Loudin is multi-tenant with two company tiers. If you're a software
provider or security integrator deploying this for your customers, **you are
the platform** — this page explains what that means and how the tiers map to
a real business.

```
Platform (you)
└── End-user companies          ← your customers
```

## The two tiers

| Tier (`companies.company_type`) | Who it is | What their admins see |
|---|---|---|
| `platform` | The operator of the install — you | Everything: the company directory, full device fleet, integrations, API keys, webhooks, audit log — plus People / own-company Devices, so the platform can manage doors of its own |
| `end_user` | A company that owns and uses locks | Only their own workspace: their people, credentials, devices, schedules, events |

There is no separate role table for these tiers. A user is either an
**Admin** or a regular **User** (`user_type_id` 1 or 2), and what *kind* of
admin they are comes from their company's `company_type`. Permission checks
therefore combine both: an Admin at the platform company sees the platform
surfaces; the same Admin role at an end-user company sees only that
workspace.

> **No reseller tier.** Earlier versions had a middle "reseller" tier for a
> dealer channel; it was removed (migration `090_remove_reseller_type.sql`).
> The platform administers every end-user company directly. The
> `companies.parent_company_id` column remains but is unused.

## Installers (optional third tier)

An **installer** is a cross-company technician business: it deploys and
services door systems for many customers but owns no doors of its own. It
is a third `company_type`, `installer`, and it is optional — a customer
with no installer looks exactly as before.

Access is a **grant**, not ownership. A customer admin (Settings →
Workspace → Installer access) or the platform admin (company detail page)
grants an installer company access to a customer workspace, and either can
revoke it at any time. Grants are many-to-many and have no expiry.

Installer users work by opening a **service session**: from their home
workspace they pick a customer and the API swaps their session for one
scoped to that company. Inside it they are full admins — devices, people,
credentials, schedules, workspace details — with three exceptions that stay
customer-only: cancelling the subscription, managing login users, and
changing who may service the doors. Every action lands in the audit log as
the installer acting on behalf of the customer. Revoking a grant ends live
sessions on their next request.

Installer companies come into existence two ways: an installer business
signs up on the public signup page and picks "I install doors for others"
(a company name is required; the company is active immediately), or the
platform admin provisions one (Directory → New company → Installer) and
invites its first admin.

Installers can in turn **provision their own customers**: an installer Admin
uses Customers → New customer, which creates the end-user company, invites
its first admin, and grants the installer access in one step
(`POST /api/installer/customers`). The technician can open the workspace and
deploy doors straight away; the customer's admin accepts the invite and can
revoke the grant at any time. Billing between the platform and installers is out
of scope for Loudin core; the `installer.granted` / `installer.revoked`
webhook events exist so an external billing system can follow along.

## Users vs. people

The two directories are deliberately separate:

- **`users`** — software logins. Admins and staff who sign into the web app
  (for platform, end-user and installer companies alike).
- **`people`** — door-access credential holders: employees, cleaners,
  contractors who hold a PIN or card but never log into anything.

Your customers' employees are almost all *people*, not users. A typical
end-user company has one or two users (the office manager) and dozens of
people.

A workspace's first user is created with the company (signup, Google
sign-in, or `scripts/create-admin.js`). Further users are added by
**invite**: an Admin opens People → **Invite user**, enters an email, and
Loudin emails a single-use link (`/invite/:token`, valid 7 days) where the
invitee sets a password and lands signed in to the same company. Invited
users join as Admins by default; the API (`POST /api/workspace/invites`)
also accepts `role: "user"` for a read-only login. Only a hash of the token
is stored, and the inviting Admin gets the link back in the response so
instances without an email provider can still onboard users by sharing it.

## How end-user companies arrive

Two onboarding paths, both landing in the same place:

1. **Self-signup** (`/signup`) — open registration, if `SIGNUPS_ENABLED`
   allows it.
2. **Created by you** — platform admins create companies directly from the
   Directory.

Closing open signup (`SIGNUPS_ENABLED=false` or the bootstrap's
`--shape own-doors`) disables path 1; you then onboard every company from
the Directory.

## Devices and ownership

Devices belong to exactly one company (`devices.company_id`), or to the
**unclaimed pool** (`NULL`) before anyone claims them. Any company —
end-user or the platform itself — claims devices the same way (search by
serial suffix, claim, push credentials). Releasing a device returns it to
the pool without touching the hardware. See
[integrations/simkura.md](./integrations/simkura.md) for the full lifecycle.

The platform company managing its own devices is what makes the
single-company deployment shape work with zero special casing — see
[deployment-shapes.md](./deployment-shapes.md).

## Mapping to your business

- **Solo integrator, direct customers** — you're the platform; each customer
  is an end-user company. Onboard by open signup or create them yourself.
- **Software provider / hosted product** — you're the platform; every
  customer is an end-user company you administer from one place.
- **Single company, own doors** — one platform company, nobody else; the
  multi-tenant machinery idles until you add a second company. Bootstrap
  with `--shape own-doors`.

Rebrand the whole thing as yours via [white-label.md](./white-label.md);
subscribe external systems (CRM, billing, monitoring) to company and device
lifecycle events via [integrations/webhooks.md](./integrations/webhooks.md).
