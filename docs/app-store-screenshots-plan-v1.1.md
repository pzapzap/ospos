# App Store Screenshots — v1.1 Capture Plan

**Goal:** ten screenshots that sell the v1.1 story — coffee shops, food trucks, and counter-service businesses can run a real register on their iPhone with modifier groups, customize sheets, and the QSR-ready feature set.

**Target sizes (required by App Store Connect):**
- **6.7" iPhone (Pro Max class)** — 1290 × 2796 px, portrait — capture on your iPhone 16 Pro Max if you have one; otherwise the simulator at that resolution
- **6.5" iPhone** — 1284 × 2778 px (iPhone Xs Max / 11 Pro Max class) — required for the App Store; the simulator can produce this

Apple's review only requires ONE size if you flag the others as fallback. Submit just 6.7" if you're short on time — the App Store will auto-scale for older devices.

**Number of shots:** 10 (App Store cap). Order matters — the first 3 are what 90% of browsers see; everything past 5 only appears when someone actively swipes.

**Capture workflow:**
1. Open OSPOS on a fresh menu (use the Habit-burger preset you'll export tonight, or rebuild a clean Coffee Shop preset).
2. Build the exact menu listed under each shot's "Setup" before capturing.
3. iOS screenshot (Side button + Volume Up) — this captures at the native device resolution.
4. AirDrop or iCloud Photos to your Mac.
5. Hand the raw PNGs to Claude Design for marketing copy treatment.

**Important: Test Mode OFF and use real-looking prices.** Customers reading the App Store want to see plausible menus. $4 lattes, $12 sandwiches, $0.50 chips. No `Test Item 1`.

---

## Shot 1 — Hero: Order Screen with QSR Menu

**The most important shot.** First impression. This is the one that has to convert "browsing a POS app" → "I want to try this."

**Setup:**
- Coffee Shop preset: 9 items across 3 categories — Espresso Bar (Drip Coffee $3.50, Cappuccino $4.75, Latte $5.25), Pastries (Almond Croissant $4.25, Bagel $3.50, Cinnamon Roll $4.75), Cold Drinks (Iced Latte $5.50, Cold Brew $4.50, Lemonade $4.00)
- Each item with its sticker (drinks/coffee, food/croissant, etc.)
- QSR mode ON in Settings
- Empty cart (no items rung)

**Capture:** Order tab, QSR strip showing "ALL ITEMS" eyebrow + three category pills, full 3-column menu grid visible.

**Marketing angle for copy:** "Your phone is your register" / "Tap to Pay POS · no monthly fee" / lead with the 1% pricing.

---

## Shot 2 — Customize Sheet (Modifier Groups in Action)

The flagship v1.1 feature — proves OSPOS isn't a flat-menu coffee app anymore.

**Setup:**
- Latte item with two modifier groups: "Milk" (required, single-select, options: Whole/Almond+$0.75/Oat+$0.75 with Almond pre-selected) AND "Extras" (optional, multi-select, options: Extra shot +$1.00, Vanilla syrup +$0.50, Light foam, Extra hot)
- Tap Latte → CustomizeItemModal opens
- Select Almond + Extra shot + Vanilla syrup
- Quantity 1

**Capture:** Customize sheet with the milk radio group at top (Almond highlighted), Extras group below with two checked, "Add — $7.25" button visible at bottom.

**Marketing angle:** "Modifier groups for any menu" / "Required vs. optional, single vs. multi, defaults that just work."

---

## Shot 3 — QSR Mode Filtered

Shows the QSR-ready angle without abstraction.

**Setup:**
- Same Coffee Shop menu, QSR mode ON
- Tap the "Pastries" category pill
- Eyebrow shows "SHOWING · PASTRIES"
- Only pastry items rendered in the grid (the others filtered out)

**Capture:** QSR strip with Pastries selected (cyan border + tint on that pill), filtered 3-item grid below.

**Marketing angle:** "Built for menus with 20+ items" / "Coffee shops, sandwich spots, taco trucks — categories that actually filter."

---

## Shot 4 — Cart with Adaptive Grow + Modifier Lines

Shows the in-progress order rung up, with modifier sub-lines visible in the cart.

**Setup:**
- Ring up 4-5 items, mix of customized and plain
- One latte with "Almond · Extra shot" sub-line
- One cappuccino with "Oat" sub-line
- Two croissants (stacked as "2× Almond Croissant")
- One cold brew plain
- Cart is showing the adaptive-grown state (cart panel taking ~60% of screen)

**Capture:** Order screen with cart panel mid-grown, items with their indented mod sub-lines, running subtotal/tax/total visible.

**Marketing angle:** "Cashier-fast ringing" / "Cart shows what you actually rang."

---

## Shot 5 — Sold-Out (86'd) Toggle in Menu Builder

Shows the v1.1 sold-out flag without needing to be on the Order screen.

**Setup:**
- Menu Builder → tap "Cinnamon Roll" item
- Inside Add Item modal, scroll to "Sold out today" Switch — flip ON (it shows the amber-toned active state)

**Capture:** Add Item modal with the sold-out toggle ON, label "Sold out today" + sub-text visible.

**Marketing angle:** "Mark items 86'd in one tap — no deleting, no re-adding tomorrow."

---

## Shot 6 — Discount Applied on Receipt Preview

Shows the discount feature paying off.

**Setup:**
- Ring up a $30 cart
- Apply a 15% off discount with reason "Happy hour"
- Complete a CASH transaction
- ReceiptScreen appears showing the breakdown

**Capture:** ReceiptScreen (post-payment) with the items list + Subtotal $30.00 / Discount -$4.50 (15% off · Happy hour) / Tax / Total. The "Email Receipt" / "Text Receipt" buttons visible at the bottom.

**Marketing angle:** "Discounts and comps · with reason notes that show on receipts."

---

## Shot 7 — Sticker Picker

Shows the v1.1 sticker library expansion (46 → 193) as a delightful feature.

**Setup:**
- Add Item modal open
- Tap the sticker trigger row → StickerPickerModal opens to Food category
- Search bar empty, full 4-column grid visible with as many stickers as fit on screen

**Capture:** StickerPickerModal showing the 4-tab strip (Food/Drinks/Retail/Service), 4-column Fluent Emoji grid filling the rest of the screen.

**Marketing angle:** "193 hand-curated stickers — search 'pickle,' 'iced coffee,' 'avocado.'"

---

## Shot 8 — Summary Tab (Today's Sales)

Proves OSPOS isn't a toy — it tracks the day end-to-end.

**Setup:**
- Pre-populate by running ~5-8 fake transactions before capturing (mix of cash and card if you can; otherwise all cash is fine — the summary just shows totals)
- Summary tab, "Today" range selected
- Should show: total sales total, transaction count, cash vs card breakdown, average ticket

**Capture:** Summary screen with real-looking numbers (e.g. $247.50 total sales, 12 transactions, avg $20.62).

**Marketing angle:** "See your day in real-time" / "Export to CSV anytime."

---

## Shot 9 — Payment Screen (Cash with Change)

Quick but valuable — shows the cash mode that costs $0, lifetime.

**Setup:**
- Ring a $12.75 cart
- Tap Charge → cash option
- Enter $20 tendered
- Screen shows change due: $7.25

**Capture:** PaymentScreen with the cash-tendered numeric keypad and "Change due $7.25" prominently visible.

**Marketing angle:** "Cash is always free · works offline · no signup required."

---

## Shot 10 — Tap to Pay Reader Animation (or Receipt After Card Tap)

The Stripe Terminal SDK shows a system-level "Hold card here" sheet during a Tap to Pay flow. That's Apple's UI, not OSPOS's — so we either capture it (legal under their developer terms) or skip it. If you can't easily reproduce in test mode, swap to: the card-payment ReceiptScreen showing the Visa ••••1234 line.

**Setup option A (system sheet):** Tap to Pay flow active, customer-facing iPhone screen showing the "Hold here to read card" animation.

**Setup option B (post-card receipt):** Complete a $7.50 card charge, ReceiptScreen showing Card • Visa ••••1234 line.

**Capture:** Whichever's cleaner.

**Marketing angle:** "Tap to Pay on iPhone · no card reader · no hardware."

---

## What to NOT include (deliberate cuts)

- Settings screen — boring, not a selling point
- Modifier group editor — too internal, save for power-user docs
- Stripe Connect onboarding — defers a "wait, I need to set this up?" reaction
- Empty states — looks broken
- Onboarding flow — assumes the user has already decided to install

---

## Handoff to Claude Design

When you AirDrop the captures to Claude Design, give them:
1. This file (so they know the marketing angle for each shot)
2. The App Store copy doc (`docs/app-store-copy-v1.1.md`) so the copy on the screenshots aligns with the App Store description
3. Hex colors from `src/constants/theme.ts` — they'll already match OSPOS's Liquid Glass palette but worth surfacing the cyan (#22D3EE), sand (#D4A574), and surface (#18181B)

Claude Design's typical pattern: each screenshot becomes a 1290 × 2796 composition with:
- App screenshot in a phone frame on the bottom 60-70%
- Marketing headline at the top (large, bold, 1-2 lines)
- Tagline under the headline (smaller, supporting line)
- OSPOS branding mark in the corner

We're not building those compositions — Claude Design is. Our job is the raw captures + the angle hints.

---

## Capture session schedule

Estimated time once build 34 + dogfood are done:

- **Setup the Coffee Shop menu:** 15-20 min
- **Capture shots 1-7:** 30 min (most are sub-1-min state changes)
- **Capture shots 8-10:** 20 min (Summary needs pre-run transactions; PaymentScreen needs flow)
- **Total:** ~1.5 hours for everything

Pair this with the existing v1.1 launch plan — capture should happen on **2026-06-12 (Friday)** at the latest to leave Apple review buffer for a 6/15 release.
