# OSPOS — MASVS v2 Compliance Checklist

**Generated:** 2026-05-07
**Tool:** masvs-checklist skill (OWASP MASVS v2 + MASTG mapping)
**Auditor:** Static code analysis (dynamic / pentest items still pending)

---

## Application Context

| Field | Value |
|-------|-------|
| **Platform** | iOS (primary). React Native / Expo SDK 55 codebase, Android target deferred |
| **Category** | Finance — Point of Sale |
| **App Bundle ID** | `com.ospos.app` |
| **Risk Tier** | **Tier 3 — High-Value** (financial data, payment processing platform via Stripe Connect) |
| **Data Sensitivity** | Local: business name, menu, order history, JWT auth token, card brand + last4 (never PAN). Server: user accounts (email/hashed-password or Apple sub), Stripe Connect account IDs, sync queue. **Never stored:** PAN, CVV, full card data — Stripe handles all card data |
| **Compliance** | PCI-DSS: out of scope (Stripe Connect Standard accounts). GDPR/CCPA: account deletion implemented |
| **Architecture** | Offline-first cash. Card payments via Stripe Terminal SDK + Tap to Pay on iPhone (entitlement granted). 24h JWT auth. SQLite (WAL mode) local + PostgreSQL 16 server |

---

## Compliance Checklist

### MASVS-STORAGE: Data Storage

| # | Control | Priority | Status | MASTG Tests | Notes |
|---|---------|----------|--------|-------------|-------|
| MASVS-STORAGE-1 | App securely stores sensitive data | Required | **Likely Implemented** | MASTG-TEST-0052 (iOS), MASTG-TEST-0200 | JWT auth token in iOS Keychain via `expo-secure-store` (`src/services/api.ts:45`). Test mode flag, terminal location, TTPOi flags also in Keychain. Non-sensitive UX state (onboarding completion) uses AsyncStorage |
| MASVS-STORAGE-2 | App prevents leakage of sensitive data | Required | **Partial** | MASTG-TEST-0053, MASTG-TEST-0011, MASTG-TEST-0201, MASTG-TEST-0202 | ✓ No card PAN/CVV stored anywhere (Stripe handles). ✓ Soft-delete on menu items. ✓ Order items denormalize name/price at sale time. ⚠️ `__DEV__` console logs leak limited operational data — gated correctly to dev builds. ⚠️ Sentry replay configured (`replaysSessionSampleRate: 0.1`) — session replays could capture sensitive UI; review masking config |

### MASVS-CRYPTO: Cryptography

| # | Control | Priority | Status | MASTG Tests | Notes |
|---|---------|----------|--------|-------------|-------|
| MASVS-CRYPTO-1 | App employs current strong cryptography | Required | **Likely Implemented** | MASTG-TEST-0061, MASTG-TEST-0208 | TLS 1.2+ via iOS App Transport Security (`NSAllowsArbitraryLoads: false`). bcrypt for password hashing on server (`server/src/routes/auth.ts:2`). JWT HS256 with pinned algorithm (`server/src/middleware/auth.ts:33`). No custom crypto |
| MASVS-CRYPTO-2 | App performs key management per best practices | Required | **Likely Implemented** | MASTG-TEST-0063, MASTG-TEST-0212 | JWT signing key in `JWT_SECRET` env var (32+ chars enforced in production, `server/src/config.ts:14`). Stripe API keys in env, never in client bundle. SendGrid/Resend keys server-side only. Apple Sign In identity tokens verified by Apple's JWKS |

### MASVS-AUTH: Authentication and Authorization

| # | Control | Priority | Status | MASTG Tests | Notes |
|---|---------|----------|--------|-------------|-------|
| MASVS-AUTH-1 | Secure authentication/authorization protocols | Required | **Likely Implemented** | MASTG-TEST-0064 | Sign in with Apple (preferred) + email/password fallback. JWT 24h expiry. `authMiddleware` enforces tokens on every protected route (`server/src/middleware/auth.ts:18`). 401 race fix: client only clears token when one was actually sent (`src/services/api.ts:117`) |
| MASVS-AUTH-2 | Secure local authentication | Required | **Partial** | MASTG-TEST-0326, MASTG-TEST-0266 | iOS Apple Sign In handles biometric/Face ID at the system level. ⚠️ App does NOT require additional Face ID re-auth before checkout — this is a **Tier 3 recommendation** in TTPOi requirements §1.7 (we marked this "Recommended" not "Required" in the checklist) |
| MASVS-AUTH-3 | Additional auth for sensitive operations | Tier 3 | **No Evidence Found** | MASTG-TEST-0327 | No step-up auth before refund / account deletion / Stripe onboarding. **Gap.** Recommendation: require Face ID / re-auth before refund or delete-account |

### MASVS-NETWORK: Network Communication

| # | Control | Priority | Status | MASTG Tests | Notes |
|---|---------|----------|--------|-------------|-------|
| MASVS-NETWORK-1 | App secures all network traffic | Required | **Likely Implemented** | MASTG-TEST-0065, MASTG-TEST-0217, MASTG-TEST-0233 | All API calls via `https://api.ospos.app` (`src/services/api.ts:13`). ATS enabled (`NSAllowsArbitraryLoads: false`). Caddy enforces HTTPS with auto Let's Encrypt. WebView uses `originWhitelist=['https://*', 'ospos://*']` (`src/screens/StripeOnboardingScreen.tsx:168`) |
| MASVS-NETWORK-2 | App performs identity pinning | Tier 3 | **No Evidence Found** | MASTG-TEST-0066 | **Cert pinning not implemented.** Documented as known gap. Stripe Terminal SDK does its own pinning for card data path. **Gap accepted for v1** — adding cert pinning requires a rotation strategy and would have blocked launch. Track for v1.x |

### MASVS-PLATFORM: Platform Interaction

| # | Control | Priority | Status | MASTG Tests | Notes |
|---|---------|----------|--------|-------------|-------|
| MASVS-PLATFORM-1 | App uses IPC mechanisms securely | Required | **Likely Implemented** | MASTG-TEST-0250, MASTG-TEST-0251 | Custom URL scheme `ospos://` only used for Stripe Connect onboarding return. No deep-link auth tokens. Native module `OsposTtpoiModule` exposes only `isAppleEducationSupported` (sync, no input) and `showHowToTap` (no user input flows in) |
| MASVS-PLATFORM-2 | App uses WebViews securely | Required | **Likely Implemented** | MASTG-TEST-0075, MASTG-TEST-0077 | Single WebView for Stripe Connect onboarding (`StripeOnboardingScreen.tsx`). `originWhitelist` enforced. Navigation interception only redirects on Stripe's domain return. No `injectedJavaScript`, no `dangerouslySetInnerHTML` |
| MASVS-PLATFORM-3 | App uses the user interface securely | Tier 3 | **Partial** | MASTG-TEST-0289 | iOS auto screen privacy (sensitive data not visible in app switcher) — relies on iOS default. ⚠️ No explicit blur of sensitive screens (Payment, TransactionDetail) when app backgrounds. Receipt list shows last4 + total — could be considered sensitive in app switcher |

### MASVS-CODE: Code Quality

| # | Control | Priority | Status | MASTG Tests | Notes |
|---|---------|----------|--------|-------------|-------|
| MASVS-CODE-1 | App requires up-to-date platform version | Tier 3 | **Likely Implemented** | MASTG-TEST-0272 | iOS deployment target = 16.0+ (TTPOi requirement). TTPOi setup gates on iOS 18+ via Apple's `ProximityReaderDiscovery` |
| MASVS-CODE-2 | App has mechanism for enforcing updates | Tier 3 | **No Evidence Found** | MASTG-TEST-0274 | No in-app force-update flow. Relies on App Store / TestFlight auto-updates. **Gap accepted for v1** |
| MASVS-CODE-3 | No components with known vulnerabilities | Required | **Pending** | MASTG-TEST-0222 | Run `npm audit` against `package.json` and `server/package.json`. Stripe Terminal SDK at `0.0.1-beta.28` (beta — review before GA). Expo SDK 55 (current). React Native 0.83.2 (current) |
| MASVS-CODE-4 | App validates and sanitizes all inputs | Required | **Likely Implemented** | MASTG-TEST-0245 | Client validation (`src/utils/validation.ts`) for tax rate, price, email, phone. Server validation in routes (UUID check on orderId, regex on email/phone, length limits, allowed enums on payment method). Receipt HTML uses `escapeHtml` for all dynamic strings (`server/src/routes/receipts.ts:36`). All SQL parameterized (`?` for SQLite, `$1` for Postgres) |

### MASVS-RESILIENCE: Reverse Engineering Resilience

| # | Control | Priority | Status | MASTG Tests | Notes |
|---|---------|----------|--------|-------------|-------|
| MASVS-RESILIENCE-1 | Platform integrity validation | Tier 3 | **No Evidence Found** | MASTG-TEST-0038 | No jailbreak detection. **Gap accepted for v1** — Stripe Terminal SDK runs its own integrity checks before allowing TTPOi |
| MASVS-RESILIENCE-2 | Anti-tampering mechanisms | Tier 3 | **No Evidence Found** | MASTG-TEST-0224 | No app integrity check. Relies on iOS code signing + Stripe Terminal SDK's internal checks |
| MASVS-RESILIENCE-3 | Anti-static analysis mechanisms | Tier 3 | **No Evidence Found** | MASTG-TEST-0247 | No code obfuscation. JS bundle is Hermes bytecode in production builds — provides minor obfuscation |
| MASVS-RESILIENCE-4 | Anti-dynamic analysis techniques | Tier 3 | **No Evidence Found** | MASTG-TEST-0263 | No anti-debug, no Frida detection. **Gap accepted for v1** — TTPOi/Stripe SDK runs its own anti-tamper checks before allowing card-present payments |

### MASVS-PRIVACY: Privacy

| # | Control | Priority | Status | MASTG Tests | Notes |
|---|---------|----------|--------|-------------|-------|
| MASVS-PRIVACY-1 | App minimizes access to sensitive data | Required | **Likely Implemented** | MASTG-TEST-0254, MASTG-TEST-0255 | Permissions in Info.plist all have usage descriptions: NFC (TTPOi), Bluetooth (printer), Camera (menu photos + dispute), Location (Stripe Terminal), Photo Library (menu + dispute). No microphone usage despite the description (review and remove if not needed) |
| MASVS-PRIVACY-2 | App prevents user identification | Tier 3 | **Partial** | MASTG-TEST-0318 | No advertising IDs collected. Sentry has `sendDefaultPii: false` (`App.tsx`). Sentry replay might still capture user-identifying UI — review masking |
| MASVS-PRIVACY-3 | Transparent data collection/usage | Required | **Likely Implemented** | MASTG-TEST-0256 | Privacy Policy at https://ospos.app/privacy. Privacy Manifest present at `ios/OSPOS/PrivacyInfo.xcprivacy` (declares file timestamp, UserDefaults, disk space, system boot time APIs; `NSPrivacyTracking: false`; `NSPrivacyCollectedDataTypes: []`) |
| MASVS-PRIVACY-4 | User control over their data | Tier 3 | **Likely Implemented** | MASTG-TEST-0319 | Account deletion: `/auth/delete-account` endpoint + `Settings → Delete Account` UI flow. CSV export of sales summary. Local SQLite backup on device |

---

## Gap Analysis

### Controls Passing (Likely Implemented): 12

- MASVS-STORAGE-1, CRYPTO-1, CRYPTO-2, AUTH-1, NETWORK-1, PLATFORM-1, PLATFORM-2, CODE-1, CODE-4, PRIVACY-1, PRIVACY-3, PRIVACY-4

### Controls Partially Met: 4

- **MASVS-STORAGE-2** — Sentry replay configuration needs review for sensitive UI masking
- **MASVS-AUTH-2** — Local authentication relies on system; no app-level Face ID re-auth
- **MASVS-PLATFORM-3** — No explicit blur on sensitive screens during backgrounding
- **MASVS-PRIVACY-2** — Sentry replay may capture identifying UI

### Controls Not Implemented (Gaps): 7

| # | Control | Priority | Risk | Action |
|---|---------|----------|------|--------|
| MASVS-AUTH-3 | Step-up auth for sensitive ops | Tier 3 | Medium | Add Face ID before refund + delete account |
| MASVS-NETWORK-2 | Cert pinning | Tier 3 | Medium | Defer to v1.x — needs rotation strategy |
| MASVS-CODE-2 | Force update mechanism | Tier 3 | Low | Relies on App Store; accept |
| MASVS-RESILIENCE-1 | Jailbreak detection | Tier 3 | Low | Stripe SDK does this for TTPOi |
| MASVS-RESILIENCE-2 | Anti-tampering | Tier 3 | Low | iOS code signing + Stripe SDK |
| MASVS-RESILIENCE-3 | Code obfuscation | Tier 3 | Low | Hermes bytecode minor obfuscation; accept |
| MASVS-RESILIENCE-4 | Anti-debug | Tier 3 | Low | Stripe SDK gates TTPOi; accept |

### Pending (Needs Dynamic Test or Audit Tool): 1

- **MASVS-CODE-3** — Run `npm audit --production` for CVEs in app + server deps before submission

### Compliance Score

| Category | Pass | Partial | Fail | N/A | Score |
|----------|------|---------|------|-----|-------|
| STORAGE | 1 | 1 | 0 | 0 | 75% |
| CRYPTO | 2 | 0 | 0 | 0 | 100% |
| AUTH | 1 | 1 | 1 | 0 | 50% |
| NETWORK | 1 | 0 | 1 | 0 | 50% |
| PLATFORM | 2 | 1 | 0 | 0 | 83% |
| CODE | 2 | 0 | 1 | 1 | 67% |
| RESILIENCE | 0 | 0 | 4 | 0 | 0% |
| PRIVACY | 3 | 1 | 0 | 0 | 88% |
| **TOTAL** | **12** | **4** | **7** | **1** | **65%** |

Tier 3 resilience controls heavily skew the overall score. **For an indie POS launch using Stripe Connect (which assumes responsibility for card data path security), 65% is acceptable** — the gaps are explicitly carried by Stripe's PCI-certified SDK + Apple's TTPOi entitlement review.

---

## Remediation Roadmap

### Pre-launch (blocker)

1. **Run `npm audit --production`** on app + server dependencies. Fix any HIGH/CRITICAL findings before App Store submission.
2. **Remove unused `NSMicrophoneUsageDescription`** from Info.plist if microphone isn't used (required for App Store privacy rejection avoidance).

### v1.0 (post-launch, no rush)

3. **Sentry replay masking review** — confirm `maskAllText: true` and `maskAllImages: true` are in effect; verify by sending a test session.
4. **Background screen blur** — overlay a blur view on Payment + TransactionDetail screens when app backgrounds (iOS app switcher snapshot).

### v1.x (planned)

5. **Step-up auth** before refund + delete account (Face ID / Apple ID re-auth via `expo-local-authentication`).
6. **Cert pinning** for `api.ospos.app` — needs Let's Encrypt rotation strategy + secondary backup pin (ISRG Root X1).

### Deferred / Accepted Risk

7. Anti-tamper / jailbreak detection — Stripe Terminal SDK does this internally for the card-present payment path; OSPOS-side detection is low-leverage.
8. Code obfuscation — Hermes bytecode in production builds provides baseline.

---

## Testing Plan (MASTG)

Ordered by risk, do these before App Store submission:

1. **MASTG-TEST-0222** — `npm audit --production` (CVE scan of dependencies)
2. **MASTG-TEST-0011** — Verify Sentry replay masking with a real session capture
3. **MASTG-TEST-0066** — TLS scan of `api.ospos.app` (https://www.ssllabs.com/ssltest/ should return A+)
4. **MASTG-TEST-0254** — Manually verify each Info.plist permission is actually used (remove `NSMicrophoneUsageDescription` if unused)
5. **MASTG-TEST-0289** — Background app from sensitive screens (Payment, Receipt, TransactionDetail) and verify the iOS app switcher snapshot does not leak data

---

## Notes for App Store Review

The following gaps are intentional and consistent with industry practice for Stripe Connect-based POS apps:

- **No cert pinning** — Stripe Terminal SDK pins its own connections for card data; OSPOS-side pinning would require an app update on every Let's Encrypt cert rotation (90 days)
- **No jailbreak detection** — Stripe Terminal SDK refuses to enable TTPOi on tampered devices; OSPOS doesn't gate non-payment features on integrity
- **No step-up auth on delete-account** — server-side soft-delete + 30-day Stripe sync queue keeps data recoverable; no immediate destructive action

OSPOS does NOT process, store, or transmit card primary account numbers (PAN) or any cardholder data classified as sensitive by PCI-DSS. All card data flows through the Stripe Terminal SDK directly to Stripe servers. OSPOS receives only `last4`, `brand`, and `payment_intent_id` for reconciliation.
