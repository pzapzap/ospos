# App Store "What's New" — v1.1.1

**Build:** 40
**Version:** 1.1.1
**Target submit:** 2026-06-25 (Thursday morning)
**Status:** Ready to paste into App Store Connect

---

## Paste this into the "What's New in This Version" field

```
v1.1.1 is a polish patch focused on the Stripe Connect signup flow:

• "Skip for now" button on Stripe setup — start in cash mode and connect
  Stripe later from Settings whenever you're ready.
• "No website? Use Instagram" hint — Stripe accepts Instagram, Facebook,
  Yelp, or any social profile URL as your business website.
• Friendlier session-expired message — if you see a "Something went wrong"
  after a long break, sign out + back in from Settings to refresh.
• Crash reporting wired up — we can finally see and fix bugs that real
  merchants hit. Anonymous, no PII.

Thanks for using OSPOS. Send feedback to phil@tttships.co.
```

**Character count:** ~575 / 4000 — well under the limit.

---

## Paste this into the App Review Notes field

```
v1.1.1 is a polish-only patch over v1.1 (build 38). No new features in
the Tap to Pay on iPhone flow, no changes to Stripe Connect onboarding
logic, no changes to payment-handling code. Changes are limited to:

1. UI additions on the StripeOnboarding screen (a "Skip for now" button
   that drops the merchant into cash mode, and a hint card about social
   profile URLs).
2. A more specific error message when JWT tokens expire ("Session
   expired — sign out and back in" instead of the generic "Something
   went wrong").
3. Sentry crash reporting DSN added to the production build env — fixes
   a misconfiguration in v1.1 where Sentry was initialized with an empty
   DSN and captured no events.

Demo credentials (unchanged from v1.0):

Email: appstore-review@tttships.co
Password: crNrrLmUwNBUHBWKiuaNPUpD

The $1.00 PaymentIntent cap on this account is still enforced server-side
to prevent accidental real charges during review.

Contact: phil@tttships.co
```

---

## Notes for Phil

- After Apple approves: **tag the commit `v1.1.1` in git** before flipping the repo public on 6/30. That tag becomes the canonical first publicly-readable OSPOS version.
- Don't bother updating the App Store description, screenshots, or keywords for v1.1.1 — this is a point release. Save the description refresh for v1.2 or v2 when there's a feature story.
