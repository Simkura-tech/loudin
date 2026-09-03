# Security Policy

This software controls physical door locks. A vulnerability here can translate into someone opening a door they shouldn't, so we take reports seriously and appreciate the effort it takes to make one.

## Reporting a vulnerability

**Please report vulnerabilities privately via GitHub Security Advisories** — use the **"Report a vulnerability"** button under this repository's **Security** tab. That is the canonical reporting path; the project does not currently operate a security email address.

Please do **not** open a public issue or pull request for a security problem.

Include what you can: affected endpoint or component, reproduction steps, and impact as you understand it. Proof-of-concept detail is welcome; there's no need for a polished writeup.

## What to expect

- We will acknowledge your report within a few business days.
- We'll keep you updated as we triage and fix, and credit you in the advisory if you'd like.
- There is **no bug bounty** — this is an open-source project without funding for one.

## Scope

Anything in this repository is in scope. The areas we consider most critical:

- **Tenant isolation** — any way for one company (platform / end-user) to read or modify another company's data, devices, people, or credentials.
- **Authentication and session handling** — login, tokens, signup and invite flows, privilege boundaries between admin tiers.
- **Credential handling** — PIN codes and card credentials at rest, in transit, and in what gets pushed to devices; anything that leaks or forges a door credential.
- **Device command paths** — unauthorized lock/unlock or configuration commands, webhook signature bypasses.

Lower severity but still welcome: information disclosure, CSRF/XSS in the web app, dependency issues with a plausible exploit path.

## Supported versions

Security fixes land on the latest `main`. There are no maintained release branches; self-hosters should track `main` (or the latest release, once releases exist).
