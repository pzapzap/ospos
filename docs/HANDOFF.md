# OSPOS — Mac Session Handoff Guide

**Date**: March 7, 2026
**Who**: Phil (pzapzap) is at David's house using a Mac Mini and/or MacBook
**Time budget**: ~4 hours
**Goal**: Get as much done as possible toward App Store submission

---

## Important Docs in This Repo
- `docs/HANDOFF.md` — this file (full context for the Mac session)
- `docs/ttpoi-requirements.md` — all 50 Apple Tap to Pay requirements with section numbers (audit the app against these)
- `docs/app-store-submission.md` — general App Store submission checklist with current status

**Start by reading all three docs/ files to understand full context.**

---

## What Is OSPOS

OSPOS is a React Native/Expo mobile point-of-sale app for small businesses. Free tier = cash-only POS, no account needed, fully offline. Paid tier = card payments via Stripe (Tap to Pay on iPhone + Bluetooth readers), receipts, cloud sync. 1% platform fee on card transactions.

- **Client**: React Native + Expo SDK 55, TypeScript strict, React Navigation, Context+useReducer, expo-sqlite (WAL mode), Stripe Terminal
- **Server**: Node.js/Express, PostgreSQL, Stripe Connect (direct charges)
- **Repo**: `~/ospos-dev/ospos/` (or wherever Phil clones it on the Mac)
- **EAS project ID**: `11e30bb6-7b87-4ce3-b53a-dbc510dc8220`, owner: `pzapzap`
- **Bundle ID**: `com.ospos.app`

---

## Priority 1: Build with Xcode for Tap to Pay Testing

This is the #1 reason Phil is on a Mac. EAS Build cannot create Development provisioning profiles — it always creates Ad Hoc profiles, which don't include the Tap to Pay entitlement. Must build directly through Xcode.

### Why Xcode specifically
- Apple granted OSPOS a **Development entitlement** for Tap to Pay on iPhone (Case-ID: 18719391)
- This entitlement ONLY works with **Development provisioning profiles** (not Ad Hoc, not App Store)
- Only Xcode with automatic signing creates true Development profiles
- EAS Build always uses distribution certificates → Ad Hoc profiles → entitlement missing → build fails

### Steps to build

```bash
# 1. Clone the repo (or copy from USB)
git clone <repo-url> && cd ospos

# 2. Install dependencies
npm install

# 3. Generate native projects
npx expo prebuild --clean

# 4. IMPORTANT: Fix Gradle wrapper version (prebuild resets to 9.0)
#    Only matters for Android, skip if iOS-only session
cd android && sed -i '' 's/gradle-9.0/gradle-8.13/g' gradle/wrapper/gradle-wrapper.properties && cd ..

# 5. Install CocoaPods
cd ios && pod install && cd ..

# 6. Open in Xcode
open ios/OSPOS.xcworkspace
```

### Xcode settings (CRITICAL)
1. **Signing & Capabilities** tab → select **Phil's Apple Developer team** (philtzamarripa@gmail.com)
2. **Check "Automatically manage signing"** — this creates the Development provisioning profile
3. Verify these capabilities are listed:
   - `com.apple.developer.proximity-reader.payment.acceptance` (Tap to Pay)
   - `com.apple.developer.applesignin` (Sign in with Apple)
4. Select Phil's **physical iPhone** as the build target (not simulator — TTPOi needs real hardware)
5. Build & Run (Cmd+R)

### Known build issues
- `minSdkVersion 26` required for Android (Stripe Terminal) — already set in build.gradle
- If prebuild resets Gradle to 9.0, the Android build will fail. Fix with sed command above.
- JVM flags needed for Android: `-Xmx2048m -XX:MaxMetaspaceSize=512m`
- If Xcode complains about provisioning profile, delete old profiles in Xcode → Settings → Accounts → Manage Certificates, then re-check automatic signing

### What to test once it builds
- **Tap to Pay flow**: Create an order → tap "Charge" → select card payment → the Tap to Pay sheet should appear
- **Sign in with Apple**: Onboarding → sign up → "Sign in with Apple" button should work
- **Cash flow**: Create menu items → ring up a cash sale → verify order appears in history
- **Offline mode**: Turn off WiFi/cellular → cash sales should still work

---

## Priority 2: DNS Setup (David Has the Keys)

David controls the DNS for `ospos.app`. These records need to be added:

### Required DNS Records

**A. Root domain (for the website)**
```
Type: A
Name: @ (or ospos.app)
Value: 157.180.82.227
TTL: 3600
```
Currently `ospos.app` points to 76.223.105.230 (wrong). `api.ospos.app` already points to 157.180.82.227 correctly.

**B. SendGrid email authentication (for receipt delivery)**
These were obtained during Twilio/SendGrid setup. Phil has the exact CNAME values from the SendGrid dashboard. Log into the Twilio/SendGrid account to get the exact records if needed:
- 3 CNAME records for DKIM verification
- 1 TXT record for domain authentication
- Check SendGrid dashboard → Settings → Sender Authentication for exact values

---

## Priority 3: Deploy Server to Hetzner

The Hetzner VPS is at `157.180.82.227`. The server code is in `ospos/server/`.

### Server deployment steps

```bash
# SSH into Hetzner
ssh root@157.180.82.227

# Install Node.js 20+, PostgreSQL, Caddy (if not already done)
# Then clone repo, install deps, set up .env, run migrations

# Required .env variables for the server:
DATABASE_URL=postgresql://...
STRIPE_SECRET_KEY=sk_live_...  # or sk_test_ for testing
STRIPE_WEBHOOK_SECRET=whsec_...
JWT_SECRET=<random-64-char-string>
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
SENDGRID_API_KEY=...
SENDGRID_FROM_EMAIL=hello@ospos.app
SENTRY_DSN=...  # server-side Sentry DSN
APPLE_TEAM_ID=...
APPLE_SERVICE_ID=...  # for Sign in with Apple server verification
APPLE_KEY_ID=...
APPLE_PRIVATE_KEY=...  # .p8 file contents
```

### Caddy configuration (web server + reverse proxy + auto-SSL)

```
ospos.app {
    root * /var/www/ospos
    file_server
    try_files {path}.html {path}
}

api.ospos.app {
    reverse_proxy localhost:3000
}
```

Website files to upload to `/var/www/ospos/`:
- `index.html` (landing page)
- `terms.html` (Terms of Service)
- `privacy.html` (Privacy Policy)
- `help.html` (Support/FAQ page)

These files are in `~/ospos-dev/` (the parent directory, NOT inside the ospos app folder).

---

## Priority 4: TTPOi Video Recording (If Time)

Apple requires 3 videos recorded on a SECOND device (NOT screen recording) for the Publishing Entitlement review.

### Videos needed
1. **New User Flow** — Fresh install → onboarding → Stripe setup → enable Tap to Pay → accept T&C → education screens → first test transaction
2. **Existing User Flow** — Launch app with existing account → settings → enable/configure Tap to Pay
3. **Checkout Flow** — Build an order → tap Charge → select Tap to Pay → customer taps card → success screen → receipt

### Requirements
- Film with another phone/camera (not screen recording)
- Show the whole phone, not cropped
- Upload via Apple's File Uploader
- Reply to Case-ID: 18719391 email thread (ttpoientitlements@apple.com, contact: Avinash)
- Also submit the completed "App Review Requirements Checklist" (.numbers file)

---

## Key Architecture Details (If Debugging Is Needed)

### App entry point
- `App.tsx` — Navigation container, onboarding state machine, StripeTerminalProvider wrapper
- `src/state/AppContext.tsx` — Monolithic context provider (order state, settings, connectivity)

### Database
- `src/db/schema.ts` — SQLite DDL (migrations V1-V4, money stored as integer cents)
- `src/db/migrations.ts` — Migration runner
- `src/db/queries.ts` — All SQLite CRUD operations

### Stripe integration
- `src/services/terminal.ts` — Stripe Terminal (Tap to Pay + Bluetooth readers)
- `server/src/services/stripe.ts` — Stripe Connect (account creation, payment intents, refunds)
- Uses **direct charges** (not destination charges) — required for Terminal + Connect
- Connection token, payment intents, and SDK all scoped to connected account via `stripeAccount` header

### Tap to Pay specific files
- `src/screens/TTPOiAwarenessModal.tsx` — Full-screen awareness modal (Apple requirement 3.2)
- `src/screens/TTPOiSetupScreen.tsx` — T&C acceptance + device setup
- `src/screens/TTPOiEducation.tsx` — Education screens (cards, Apple Pay, PIN)
- `src/components/TTPOiConfigProgress.tsx` — Configuration progress indicator

### Authentication
- Sign in with Apple: `src/screens/SignUpScreen.tsx` + `server/src/routes/auth.ts`
- JWT stored in expo-secure-store (not AsyncStorage)
- Account deletion: implemented client + server (CASCADE)

### app.json entitlements (MUST be present)
```json
"entitlements": {
  "com.apple.developer.proximity-reader.payment.acceptance": true,
  "com.apple.developer.applesignin": ["Default"]
}
```

---

## Known Issues / Gotchas

1. **prebuild --clean resets Gradle** to 9.0. Must manually fix back to 8.13.
2. **TTPOi only works on physical iPhone XS or newer** — not simulator.
3. **Server needs Apple Sign In credentials** (.p8 key) for server-side token verification.
4. **Stripe is in test mode** — use test cards (4242 4242 4242 4242) for payment testing.
5. **Sentry DSN** is env-only (not hardcoded). Must be in .env for error reporting to work.
6. **expo-secure-store** is used for JWT and test mode flag — not AsyncStorage.

---

## What's Already Done

- Full POS app built (cash + card payments, menu builder, order management, tips, tax, refunds, disputes)
- Sign in with Apple (client + server)
- Account deletion (client + server, CASCADE)
- TTPOi awareness modal, setup, education, config progress — all built
- TTPOi audit: 45/50 PASS, 0 FAIL
- 17 security audit fixes applied
- Stripe best practices implemented
- Sentry error monitoring integrated
- Landing page, Terms, Privacy, Help pages created
- Terms of Service written and reviewed

## What's NOT Done Yet

- [ ] Build on Mac via Xcode (Priority 1 today)
- [ ] DNS: Point ospos.app root to 157.180.82.227 (Priority 2 today)
- [ ] DNS: Add SendGrid CNAME/TXT records for email
- [ ] Deploy server to Hetzner (Priority 3 today)
- [ ] Upload website files to Hetzner
- [ ] Record 3 TTPOi videos + submit to Apple
- [ ] Certificate pinning on API calls (needs live server cert hashes)
- [ ] App Store Connect metadata (name, description, keywords, screenshots)
- [ ] Privacy Nutrition Labels in App Store Connect
- [ ] Required Reasons API declarations (expo-sqlite, AsyncStorage, expo-secure-store)
- [ ] Demo account for Apple reviewer
- [ ] Twilio/SendGrid credentials in server .env
- [ ] Apple Sign In server credentials (.p8 key) in server .env

---

## Accounts & Credentials Phil Should Have Ready

- **Apple Developer**: philtzamarripa@gmail.com (active enrollment)
- **Stripe Dashboard**: for API keys (test + live)
- **Twilio/SendGrid**: for SMS/email API keys
- **Hetzner**: SSH access to 157.180.82.227
- **EAS/Expo**: logged in as `pzapzap`
- **GitHub**: repo access for cloning

---

## Contact

- Apple TTPOi team: ttpoientitlements@apple.com (Avinash, Wallet Entitlements), Case-ID: 18719391
- OSPOS support email: hello@ospos.app
