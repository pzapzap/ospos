# OSPOS Audit Plan — Bridging v1.1 to v1.2 (OSS Launch)

**Authored:** 2026-06-11 by Claude Opus 4.7 (current working session) for handoff to another LLM-agent instance.
**Audit window:** 2026-06-17 → 2026-06-22 (5 weekdays).
**Hard deadline:** 2026-06-30 — public OSS launch of v1.2. Anything not addressed by then ships visible to the world.
**Output target:** machine-readable findings file at `docs/audit-findings.md`, plus inline notes via PR-style suggestions where useful.

---

## Why this audit exists

OSPOS is about to **flip its GitHub repo from private to public** under AGPL-3.0 on 2026-06-30 as the v1.2 release moment. Before that happens, every line of code in the repo becomes:

- **Readable by strangers** — including security researchers, competitors, potential contributors
- **Forkable** — anyone can clone and run their own copy
- **Attack-surface visible** — bugs in payment/auth/security become public knowledge

The author (Phil Tzamarripa, single-engineer founder) is approximately 6 months into the codebase. v1.1 ships to the App Store on 2026-06-15. The audit window opens after that, giving 5 days of focused review and 8 days to address findings before the public launch.

The author's request is an **independent pair of eyes** — find what he and the assistant he's been pairing with (current Claude Opus 4.7 session) missed.

---

## What OSPOS is (1-minute onboarding)

**OSPOS = Open Source Point Of Sale.** A free, AGPL-3.0 licensed iOS point-of-sale app that turns an iPhone into a full cash register. Cash transactions are always free. Card transactions cost 1% on top of Stripe's standard processing rate. It is *not* an inventory tracker, restaurant management system, or anything but a register.

**Tech stack:**
- App: React Native + Expo SDK 55 (managed workflow), TypeScript strict
- Local DB: expo-sqlite with WAL mode, parameterized queries, migration runner
- Payments: Stripe Terminal SDK for Tap to Pay on iPhone
- Server: Express.js + TypeScript on Node, deployed via Docker Compose on Hetzner
- Server DB: PostgreSQL 16 (raw SQL via `pg`, no ORM)
- Auth: JWT (24h expiry) stored in expo-secure-store + Sign in with Apple
- Receipts: SMTP via Resend, SMS stubbed (Twilio not yet active)
- Errors: Sentry

**Canonical onboarding doc:** `/CLAUDE.md` at the repo root. Read it first. It explains conventions ("all money in integer cents," "soft deletes," "no ORM," etc.) and is the contract for what the codebase agrees on.

**Existing docs to read for context:**
- `docs/v1.1-v1.2-launch-plan.md` — 28-day shipping plan
- `docs/app-store-copy-v1.1.md` — what we tell App Store reviewers
- `docs/apple-ttpoi-dual-device-inquiry.md` — strategic decision NOT to ask Apple before shipping (relevant for v1.3, not this audit)
- `README.md` — public-facing summary

---

## Audit scope, ordered by priority

Spend the audit budget proportional to these weights. If something is over budget, drop from the bottom up.

### Priority 1 — Security & money-handling paths (40% of audit time)

The "if this is broken, real merchants lose real money or get compromised" tier. These are the files a security researcher will skim first when the repo goes public.

#### 1.1 — Menu import (P1)
**File:** `src/utils/menuImport.ts`
**Context:** Added 2026-06-11. Accepts arbitrary JSON files from any source the user picks (Files app, AirDrop, email). The `SECURITY MODEL` block at the top of the file enumerates the threats the author and assistant identified and how they were mitigated. **Verify the claims hold up.** Specifically:

- File size cap (5 MB) enforced before parse
- Item/group/modifier count caps
- String length caps + control character stripping
- Price clamps with NaN/Infinity coercion
- `sticker_id` allowlist regex
- `image_uri` rejected outright (could it sneak through any other field?)
- Transactional import with rollback on throw
- Schema version skew rejection

Possible misses to actively hunt for:
- Could a path-traversal escape DocumentPicker's URI?
- Is the SQLite transaction actually scoping the writes, or is `getDatabase()` returning a different connection per call?
- Unicode normalization attacks (visually identical characters with different bytes — low risk but worth checking)
- What happens if `parsed.items` contains a circular reference (it shouldn't, but verify)
- Prototype pollution via `Object.assign` or spread on parsed objects (the explicit field-plucking pattern should prevent this — confirm)

**Not in scope:** Don't flag the import as "should be promoted out of Settings → Advanced" — it's intentionally hidden in v1.1 and becomes a featured surface in v1.2.

#### 1.2 — Auth + JWT (P1)
**Files:** `server/src/routes/auth.ts`, `server/src/middleware/auth.ts`, `src/services/api.ts` (client-side token storage)
**Look for:**
- Password hashing (should be bcrypt with appropriate cost — what cost factor?)
- JWT secret strength + rotation policy (is it in env, not hardcoded?)
- Token revocation handling (`revoked_tokens` table — is it consulted on every authenticated request?)
- Sign in with Apple identity_token verification (signature check against Apple's JWKS?)
- Password reset flow — is there one? If yes, audit the token format.
- Session lifetime + refresh — currently 24h hard expiry per CLAUDE.md
- Rate limiting on auth endpoints (CLAUDE.md says 20 per 15 min)

#### 1.3 — Payments + Stripe (P1)
**Files:** `server/src/routes/payments.ts`, `server/src/routes/stripe.ts`, `server/src/services/stripe.ts`
**Look for:**
- Webhook signature verification (Stripe-Signature header → `constructEvent` with the webhook secret)
- The `$1.00 demo cap` for `appstore-review@tttships.co` — is it actually enforced server-side at PaymentIntent creation, or only at display?
- Stripe Connect OAuth state CSRF protection (state parameter generated, stored, verified on callback)
- Idempotency keys on PaymentIntent creation (preventing double-charge on retry)
- Connected account scoping (a user can only act on their own Stripe account)
- Application fee calculation (1% — is it `Math.round` or `Math.floor`? Either is fine but consistency matters)
- Refund flow — can a user refund someone else's transaction?

#### 1.4 — Receipt rendering (P1)
**Files:** `server/src/routes/receipts.ts`
**Context:** HTML email template + plain text SMS template. Just updated 2026-06-10 to render modifier sub-lines and order-level discount. Phil's first reaction was that the previous template wasn't using the new fields.
**Look for:**
- All interpolated strings go through `escapeHtml()` — verify none slip through (the template is large, easy to miss)
- Server validates `req.body.orderData.items[].modifiers[].name` length before rendering (DoS via huge modifier name)
- Ownership check (`SELECT ... FROM synced_orders WHERE id = $1 AND user_id = $2`) — a valid JWT can only send receipts for orders the caller owns
- Email injection in `recipient` — verified by `EMAIL_REGEX` but worth a fresh look

### Priority 2 — Architecture & data integrity (25% of audit time)

The "if this is wrong, hard to fix later" tier.

#### 2.1 — DB migrations (P2)
**Files:** `src/db/migrations.ts`, `src/db/schema.ts`
**Look for:**
- Each migration is idempotent (re-running shouldn't break anything)
- Transactional wrapping (BEGIN/COMMIT/ROLLBACK around each migration's `up`)
- Backup behavior before destructive migrations (the `backupDatabase()` helper)
- Migration v10 `backfillModifierGroups` correctness — see `src/db/migrations.ts:98`
- No migration uses non-deterministic functions (e.g. `random()`, `current_timestamp` without explicit value)
- Foreign key constraints + cascade semantics on `deleted_at` chains

#### 2.2 — Order math (P2)
**File:** `src/state/reducers.ts`, specifically the `recalculate` function
**Look for:**
- Integer cents discipline — anywhere a float sneaks in is a tax-math bug
- Discount + tax interaction — taxable base reduction should be proportional
- Modifier price deltas applied to line totals correctly
- Quantity multipliers
- The recent bug fix on line stacking (modKey serialization) — verify the fix is correct, not just "appears to work"

#### 2.3 — Sync layer (P2)
**Files:** `src/services/sync.ts`, `src/services/api.ts`, `server/src/routes/sync.ts`
**Known issue (do NOT flag as new):** Task #120 — `sync_queue` table exists in schema and the sync engine reads from it, but **no code inserts into it**. Confirmed via grep + empty `synced_orders` in production Postgres. The audit should not flag this as a finding; instead, look at the surrounding code and report whether the sync engine itself is correct *assuming* the queue is populated. If queueing is wired up somewhere subtle, surface where.

### Priority 3 — Open-source readiness (20% of audit time)

The "people will read this on June 30" tier.

#### 3.1 — Public-facing docs accuracy (P3)
- `README.md` — does it match the code? Any references to features that don't exist or work differently than described?
- `CLAUDE.md` — internal but lives at the root; will be public. Verify "WAL mode" is actually enabled, "Sentry" is actually wired up, "JWT 24h" is the actual config.
- `LICENSE` — full AGPL-3.0 text, verify
- `NOTICE` — copyright attribution, verify

#### 3.2 — Missing OSS files (P3)
Expected at launch but not yet present:
- `CONTRIBUTING.md` — needs DCO `Signed-off-by:` policy
- `SECURITY.md` — disclosure address (security@tttships.co or similar)
- `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1
- `.github/ISSUE_TEMPLATE/` — bug report, feature request, security advisory
- `.github/PULL_REQUEST_TEMPLATE.md` — DCO signoff prompt

Surface what's missing as a checklist. Don't write them — the author + assistant will.

#### 3.3 — License headers (P3)
AGPL-3.0 recommends per-file copyright + license notice. OSPOS currently has only LICENSE + NOTICE at the root. Recommend whether per-file headers are worth adding before public launch (low ROI but standard practice).

#### 3.4 — Hardcoded secrets sweep (P3)
- Hunt for hardcoded API keys, passwords, tokens that might have been committed by mistake
- Verify `.env.example` exists for the server and matches what's used
- Verify `.gitignore` covers `.env`, build artifacts, `/ios`, `/android`, etc.

### Priority 4 — Quality (15% of audit time)

The "nice to have, won't block launch" tier.

#### 4.1 — Dead code (P4)
- Unused exports
- Imports referencing removed files
- Functions with no callers
- TODO / FIXME / HACK comments — triage

#### 4.2 — Performance (P4)
- React re-render hot spots (large `useMemo` deps lists, missing `useCallback`)
- SQLite query patterns (N+1 reads, unindexed `WHERE`s on large tables)
- FlatList rendering with 200+ items (the sticker library is 193 — does the StickerPickerModal degrade?)

#### 4.3 — Accessibility (P4)
- `accessibilityLabel` on interactive elements
- VoiceOver support
- Touch target sizes (CLAUDE.md says 48pt minimum; verify)
- Sufficient contrast on the dark theme

---

## Output format

Findings go in `docs/audit-findings.md`. **Use this exact structure for each finding** so the author can sort/triage quickly:

```markdown
### F-001 — [Short title]

**Severity:** P0 / P1 / P2 / P3 / P4
**Category:** Security / Architecture / Quality / OSS-readiness
**File:** `src/path/to/file.ts:42-58`
**Effort to fix:** trivial (<15 min) / small (15-60 min) / medium (1-4 hr) / large (>4 hr)

**What's wrong:**
[One paragraph, plain language. Include the offending code excerpt verbatim.]

**Why it matters:**
[The blast radius. Who gets hurt if this ships unfixed? When does the issue manifest?]

**Suggested fix:**
[Concrete change. If trivial, paste the diff. If non-trivial, describe the approach.]

**Confidence:** high / medium / low
[High = I verified the exploit / behavior. Medium = pattern matches a known vuln but I didn't reproduce. Low = smells off but might be intentional.]

---
```

Severity rubric:
- **P0** — must fix before v1.1 ship (data loss, account takeover, real-money loss possible)
- **P1** — must fix before v1.2 OSS launch (public-readable security or correctness issue)
- **P2** — should fix before v1.2 (architectural, hard to fix later)
- **P3** — fix when convenient (OSS-readiness, polish)
- **P4** — wishlist (cleanup, perf)

If you find something below P4 (truly stylistic / opinion), don't write it up — the noise outweighs the signal.

---

## Things to NOT flag (already known, intentional, or out of scope)

Skip these to save time:

1. **`sync_queue` never written** — Task #120, intentionally on the punch list. Audit assumes sync queueing exists when reasoning about the rest of the sync layer.
2. **Hetzner working tree drift** — server `/opt/ospos` has 18 modified files vs master. Production runs the right code via scp+rebuild; git reconciliation is scheduled separately. Not an audit concern.
3. **`appstore-review@tttships.co` demo account with $1 PaymentIntent cap** — intentional. Real merchants unaffected.
4. **Cash mode doesn't create a server account** — intentional privacy posture, not a bug.
5. **Menu doesn't sync to server** — intentional, see CLAUDE.md privacy section.
6. **Integer cents everywhere instead of decimal money library** — intentional, do not suggest swapping for big.js / dinero.
7. **No ORM, raw SQL on server** — intentional architectural choice (see CLAUDE.md "Don't Do").
8. **No Redux/Zustand, just Context + useReducer** — intentional architectural choice.
9. **Strict TypeScript (`any` forbidden except for external libs)** — intentional, don't suggest weakening.
10. **Comments are sparse** — intentional per CLAUDE.md: "Default to writing no comments." Don't suggest adding doc comments unless the file genuinely needs them for a non-obvious WHY.
11. **iPhone-only (`TARGETED_DEVICE_FAMILY="1"`)** — intentional for v1.1. iPad support is v1.3 territory and tied to a specific dual-device architecture. Don't suggest enabling iPad family.
12. **Soft deletes via `deleted_at`** — intentional pattern across items, modifiers, modifier_groups. Not a bug.

---

## Style of fixes the author wants

If you suggest fixes, follow these conventions (from CLAUDE.md):

- Don't add error handling for scenarios that can't happen
- Don't add backwards-compat shims when changing internal code
- Don't comment what code does (well-named identifiers do that); only the non-obvious WHY
- Don't refactor for style alone
- Don't introduce abstractions beyond what the task requires
- Prefer fixing the existing code over writing new files
- Validate at system boundaries (user input, external APIs), not at internal call sites

---

## Suggested execution sequence (5 days)

If you have 5 working days:

- **Day 1 (Tue 6/17):** Read CLAUDE.md, README, scan repo structure. Spend the day on Priority 1.1 (menu import) and 1.2 (auth). Surface P0/P1 only — don't worry about polish yet.
- **Day 2 (Wed 6/18):** Priority 1.3 (payments) + 1.4 (receipts). Same severity discipline.
- **Day 3 (Thu 6/19):** Priority 2 (architecture). Slower pass; check assumptions in CLAUDE.md against the code.
- **Day 4 (Fri 6/20):** Priority 3 (OSS readiness). Mostly checklist work; quick.
- **Day 5 (Sat 6/21):** Priority 4 (quality), wrap-up, final pass on findings doc, sanity-check severities.

If under-budgeted, drop P3 and P4 first.

---

## Done criteria

The audit is done when `docs/audit-findings.md` exists and contains:

1. A short executive summary at the top (3-5 sentences): what was audited, total finding count by severity, top 3 risks to address before v1.2 OSS launch.
2. Findings sorted by severity (P0 first), then by file path.
3. A "Skipped" section at the bottom listing any priority targets that were under-budgeted, so the author knows what didn't get covered.

The author will triage from there. Do NOT open PRs or make code changes — findings only.

---

## Questions the auditor can ask before starting

If anything in this plan is unclear, the author is reachable at phil@tttships.co. Reasonable scope questions:

- "Is X intentional or a bug?" → Yes, ask before flagging anything that smells designed-on-purpose.
- "Do you want me to fix Y or just report it?" → Just report. The author + main assistant will fix.
- "Is this audit covered by the contract?" → The audit is being done because Phil has access to the auditing tool until 2026-06-22. Free to him, paid to anyone else after that date.

Anything not on the priority list above is out of scope for this audit. Suggest follow-up audits if you find a category worth exploring (e.g., "the sticker library has 1617 lines of inline SVG; worth a dedicated perf audit later").

---

**Thanks for the eyes. The codebase is small enough that a thorough pass is realistic. Go find what we missed.**
