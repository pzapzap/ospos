# OSPOS Launch Guide — What You Need To Do

Everything below is manual steps that only you can do.
All code work is complete and TypeScript compiles clean.

**Last updated**: March 6, 2026

---

## Server Status (COMPLETED March 6, 2026)

Server is deployed and running on Hetzner (157.180.82.227) via Docker Compose:
- **Caddy** (reverse proxy + auto-SSL) — `api.ospos.app` live and serving HTTPS
- **Node.js/Express** server — health check passing
- **PostgreSQL 16** — all 3 migrations applied (initial schema, integer cents, Apple auth)
- **Website files** uploaded (index.html, terms.html, privacy.html, help.html) — waiting for `ospos.app` DNS

**What's configured:**
- Stripe test keys + webhook secret in `.env`
- JWT secret (64 chars) in `.env`
- Postgres password (real, not default) in `.env`

**What's NOT configured yet:**
- Twilio creds (SMS receipts) — need account setup
- SendGrid creds (email receipts) — need DNS verification (David has keys)
- `ospos.app` root DNS — currently points to wrong IP, David needs to add A record → 157.180.82.227

---

## 1. DNS (David Has Keys)

**A record for website:**
```
ospos.app → 157.180.82.227
```

**SendGrid CNAME/TXT records for email:**
Check Twilio/SendGrid dashboard → Settings → Sender Authentication for exact values.

Once DNS is set, Caddy auto-provisions SSL and the website goes live at ospos.app/terms, ospos.app/privacy, ospos.app/help.

---

## 2. Cert Pinning Hashes (After DNS)

Once `api.ospos.app` has its Let's Encrypt cert (it already does), extract the SPKI hash:

```bash
openssl s_client -connect api.ospos.app:443 -servername api.ospos.app 2>/dev/null | \
  openssl x509 -pubkey -noout | \
  openssl pkey -pubin -outform der | \
  openssl dgst -sha256 -binary | base64
```

Paste the hash into two files:
- `android/app/src/main/res/xml/network_security_config.xml` — replace `HASH_TO_BE_FILLED`
- `ios/OSPOS/AppDelegate.swift` — replace `HASH_TO_BE_FILLED`

The ISRG Root X1 backup pin (`C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=`) is already in both files.

---

## 3. EAS Secrets

```bash
eas secret:create --name EXPO_PUBLIC_SENTRY_DSN --value "<your-sentry-dsn>"
eas secret:create --name SENDGRID_API_KEY --value "<your-sendgrid-key>"
eas secret:create --name SENDGRID_FROM_EMAIL --value "noreply@ospos.app"
```

The Sentry DSN is on sentry.io under your OSPOS project settings.
SendGrid: account created on Twilio.com, needs DNS verification before API key works.

---

## 3. iOS Pod Install

```bash
cd ios && pod install && cd ..
```

This picks up TrustKit (cert pinning) and any other native deps.

---

## 4. EAS Build

```bash
# iOS
eas build --platform ios --profile production

# Android
eas build --platform android --profile production
```

If you want to test first:
```bash
eas build --platform ios --profile preview
```

---

## 5. On-Device Testing Checklist

Test these flows on a real iPhone (XS or later, iOS 16+):

- [ ] **Cash payment**: Build order → Charge → Cash → Confirm → Receipt shows
- [ ] **TTPOi awareness modal**: First launch as paid-tier user → modal appears with Apple hero image → "Enable Now" navigates to Settings
- [ ] **TTPOi setup flow**: Settings → Tap to Pay on iPhone → "Set Up" → Requirements check → Accept Terms → Apple T&C sheet → Education pages → "Done"
- [ ] **TTPOi payment**: Build order → Charge → Tap "Tap to Pay on iPhone" button → Present a contactless card → Done checkmark → Receipt
- [ ] **TTPOi not-set-up redirect**: Without setup, tap card button on Payment screen → redirects to setup
- [ ] **TTPOi education from Settings**: Settings → "View Guide" → swipeable education pages
- [ ] **Offline mode**: Airplane mode → Cash payment works → "Offline — Cash only" banner shows → Card button shows status
- [ ] **Test mode toggle**: Settings → Test Mode → Simulated TTPOi works
- [ ] **Refund**: Summary → Transaction → Issue Refund → Confirm
- [ ] **Receipt delivery**: Email receipt → check inbox; SMS receipt → check phone

---

## 6. Record Demo Videos

Apple requires 3 demo videos for the TTPOi entitlement review. Use a second iPhone to record your test iPhone.

**Video 1 — TTPOi Setup Flow** (~30s)
1. Open OSPOS → Settings → "Set Up" under Tap to Pay on iPhone
2. Show requirements check passing
3. Accept Terms → Apple T&C sheet appears
4. Education pages → Done

**Video 2 — Card Payment Flow** (~30s)
1. Tap items to build order → tap "Charge"
2. Tap "Tap to Pay on iPhone" button
3. Hold a contactless card at the top of the iPhone
4. Done checkmark → Receipt screen

**Video 3 — Full Merchant Journey** (~45s)
1. Open app → Add a menu item
2. Build an order → Charge → Cash payment → Receipt
3. Build another order → Charge → Card payment via TTPOi → Receipt
4. Summary screen showing both transactions

---

## 7. Apple Entitlement Submission

### Fill Out .numbers Checklist
Download Apple's TTPOi self-assessment checklist (they email it with the entitlement). Fill in:
- App name: OSPOS
- Bundle ID: com.ospos.app
- PSP: Stripe (Stripe Terminal SDK)
- All requirement checkboxes

### Upload via Apple File Uploader
1. Go to the Apple File Uploader URL they provided
2. Upload the 3 demo videos
3. Upload the completed .numbers checklist

### Reply to Apple
Email `ttpoientitlements@apple.com` with:
- Subject: "OSPOS — Tap to Pay on iPhone Entitlement Submission"
- Body: Confirm files uploaded, include bundle ID, link to App Store Connect listing (or TestFlight)
- Mention PSP is Stripe, using Stripe Terminal SDK

---

## 8. App Store Submission

Once Apple grants the TTPOi entitlement:

1. **App Store Connect**: Create the app listing using copy from `STORE_LISTING.md`
2. **Screenshots**: Take on real device (6.7" and 6.1" required)
3. **Privacy Policy**: Ensure ospos.app/privacy is live
4. **Review Notes**: Mention TTPOi entitlement is approved, provide test account credentials
5. Submit for review

---

## 9. Post-Launch

### TTPOi Launch Email
The server has `POST /notifications/ttpoi-launch-email` ready. Once SendGrid is configured, you can trigger it for each paid-tier user. You'll need a simple script or admin endpoint to batch-send.

### Push Notification
The server has `POST /notifications/ttpoi-launch-push` ready. Push tokens are registered automatically when paid-tier users open the app. Same deal — trigger per user when ready to announce.

### Cert Pinning Maintenance
When Let's Encrypt rotates their intermediate cert, you'll need an app update with the new hash. The ISRG Root X1 backup pin provides a grace period. Monitor Let's Encrypt announcements.

---

## Domain Check

- `api.ospos.app` → 157.180.82.227 — WORKING, HTTPS active, health check passing
- `ospos.app` → currently 76.223.105.230 (WRONG) — David needs to update A record to 157.180.82.227
- Website files (index, terms, privacy, help) are uploaded and Caddy is configured to serve them
- SendGrid sender domain NOT yet verified (needs DNS records from David)

---

## Summary

| Feature | Status |
|---------|--------|
| TTPOi compliance (5 phases) | Code complete |
| Apple-approved copy in all strings | Done |
| Apple Hero banner in awareness modal | Done |
| Legal disclaimers on all TTPOi screens | Done |
| Launch email template (SendGrid) | Done |
| Push notification (Expo Push) | Done |
| Push token server registration | Done |
| Integer cents end-to-end | Done |
| Cert pinning scaffolded (needs hashes) | Done |
| testMode in SecureStore | Done |
| RECORD_AUDIO removed | Done |
| Website TTPOi copy + disclaimer | Done |
| Store listing TTPOi copy + disclaimer | Done |
| app.json NFC description fixed | Done |
| All 17 audit violations fixed | Done |
| TypeScript clean (0 errors) | Done |
| Sign in with Apple (client + server) | Done |
| Account deletion (client + server) | Done |
| **Server deployed to Hetzner** | **Done (March 6)** |
| **All 3 server migrations applied** | **Done (March 6)** |
| **Website pages created (terms, privacy, help)** | **Done (March 6)** |
| **Website files uploaded to server** | **Done (March 6)** |
| DNS: ospos.app root A record | Waiting on David |
| DNS: SendGrid email verification | Waiting on David |
| Twilio/SendGrid creds in server .env | Not yet |
| Xcode build (Development profile) | Not yet — needs Mac |
| TTPOi video recording | Not yet — needs working build |
| App Store Connect metadata | Not yet |
| Apple TTPOi Publishing Entitlement | Not yet — needs videos |
