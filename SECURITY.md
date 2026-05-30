# Security Policy

## Supported versions

OSPOS v1.x receives security updates. Older or forked versions are the responsibility of their maintainers.

## Reporting a vulnerability

Please report security issues **privately** — do not open a public GitHub issue.

**Email**: phil@tttships.co
**Subject line**: `[SECURITY] short description`

Include:

- A clear description of the issue
- Steps to reproduce, ideally with a minimal proof of concept
- The version of OSPOS you tested against (commit SHA or App Store build number)
- Your assessment of the impact (data exposure, privilege escalation, denial of service, etc.)

We'll acknowledge receipt within 48 hours. We aim to triage and respond with a fix timeline within 7 days. Critical issues affecting production merchants get priority.

## Scope

In scope:

- The OSPOS iOS app (source in this repo)
- The OSPOS server (source under `server/`)
- The hosted backend at `api.ospos.app`
- Stripe Connect integration details, OAuth flow, webhook handling
- Local SQLite database and SecureStore key handling
- Authentication (JWT, Sign in with Apple, email+password)

Out of scope (report to the upstream maintainer instead):

- Stripe's APIs and platform
- Apple's Tap to Pay on iPhone implementation
- Third-party dependencies — please report to their maintainers; we'll bump versions once patched

## Disclosure

We'll publicly disclose vulnerabilities after a fix is shipped to all users, typically within 90 days of the original report. We'll credit you in the disclosure unless you ask to remain anonymous.

We don't currently run a paid bug bounty program. Researchers who report meaningful issues will be credited and, where appropriate, recognized in a public acknowledgments section.

## What we consider sensitive

- Card data: never leaves the device's Secure Element / Stripe Terminal SDK. If you find a way the app could observe card data, that's critical.
- Authentication tokens: JWT, OAuth state, Apple identity tokens
- Merchant emails and Stripe account IDs
- Customer emails (when entered for receipts)
- Server-side database contents

## What we deploy defensively

- Parameterized SQL everywhere (no string concatenation)
- HTTPS-only via Caddy
- JWT 24h expiry with server-side revocation
- SecureStore pinned to device (no iCloud Keychain sync)
- Stripe webhook signature verification
- CSRF protection on OAuth flow via single-use state tokens

If you've spotted a gap in any of the above, we want to know.

## Out of scope behaviors

- Demonstrating vulnerabilities against production merchants without permission
- Spamming, denial-of-service testing, or social engineering of TTTS Co. staff
- Anything that would access merchant or customer data without authorization
