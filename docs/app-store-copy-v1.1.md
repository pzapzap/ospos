# App Store Copy — OSPOS v1.1

**Status:** Draft, ready for review and paste into App Store Connect
**Drafted:** 2026-06-10
**For:** v1.1 submission (build 33, targeting 2026-06-15 release)

Copy the relevant blocks into App Store Connect. Character limits noted
in headers — App Store Connect will reject anything that exceeds them.

---

## Subtitle (max 30 chars)

**Choose one — they're listed in order of recommended preference:**

> Tap to Pay POS · 1% per card

(28 chars — leads with the differentiation, keeps the price front and center)

Alternatives if you want a different angle:

> Free POS. Tap to Pay. 1% cards.

(30 chars — leads with "free" as the hook)

> Open POS — cash free, cards 1%

(30 chars — leans on the open-source angle, sets up v1.2)

---

## Promotional Text (max 170 chars)

**This is editable without resubmission — change it anytime.**

> Now QSR-ready. Modifier groups, customize sheets, sold-out toggles, and discounts — everything you need to run a coffee shop, food truck, or counter-service spot.

(168 chars — leads with the v1.1 headline, names target verticals)

---

## App Store Description (max 4000 chars)

```
Your iPhone is the entire register.

OSPOS is a point-of-sale app that turns your iPhone into a full POS — no
hardware to buy, no monthly subscription, no contracts. Cash transactions
are free, forever. Card transactions cost 1% on top of Stripe's standard
processing rate (2.7% + 5¢ for in-person card-present in the US).

That's it. No setup fees. No hidden charges. No "starting at $0/month."


WHAT YOU CAN DO

• Accept cash from day one — works offline, no internet required
• Accept cards using Tap to Pay on iPhone — no external reader needed
• Build a menu with categories, prices, photos, and stickers
• Add modifier groups: required vs. optional, single vs. multi-select,
  defaults that pre-fill the customize sheet
• Mark items or modifiers sold out today without deleting them
• Apply order-level discounts and comps with a reason note
• Send digital receipts by email or text
• Refund full or partial sales
• Export your day's sales to CSV
• See live daily totals (orders, gross, refunds, net) in the Summary tab


NEW IN v1.1 — BUILT FOR THE COUNTER

Modifier groups make OSPOS work for coffee shops, sandwich spots, taco
trucks, ice cream stands, and any counter-service business with
customizable items. Build "Choose your milk" as a required single-select.
Build "Add toppings" as a multi-select with a max. Mark Oat Milk sold out
when you run out, without touching the rest of your menu.

QSR mode adds a category filter strip above your menu for businesses
with 20+ items across multiple categories. Flip it on in Settings.

The sticker library expanded to 193 curated illustrations across food,
drinks, retail, and service categories — search "lettuce," "pickle,"
"iced coffee," and find the right visual instantly.


WHO THIS IS FOR

• Coffee shops and cafés
• Food trucks and pop-ups
• Market vendors and farm stands
• Quick-service restaurants
• Retail boutiques and pop-up shops
• Service businesses (barbers, cleaners, tutors)
• Anyone who runs a small business and is tired of paying 3-4% to a
  payment processor for software that locks them in.


HOW TAP TO PAY WORKS

Tap to Pay on iPhone uses Apple's built-in NFC to accept contactless
payments directly on your iPhone XS or later. No card reader, no
hardware, no Bluetooth puck. You hand the iPhone to the customer (or
hold it out), they tap their card, phone, or watch — done. Powered by
the Stripe Terminal SDK.

To accept card payments, you'll connect a Stripe account during setup.
Stripe handles all the payment processing; OSPOS adds its 1%
application fee on top of Stripe's standard rate.

To accept only cash, skip Stripe — OSPOS works completely offline with
no signup required.


PRIVACY

Your cash transactions stay on your phone. They don't sync to any
server. We don't see your menu, your customers, or your sales unless
you explicitly send a receipt by email or text.

Your iPhone is the register, your Stripe account is yours, your data
is yours. If we ever disappear, you keep running.


OSPOS is built and maintained by TTTS Co. LLC. Source code is available
under AGPL-3.0 at github.com/pzapzap/ospos. Send feedback to
phil@tttships.co.
```

(~3,200 chars including paragraph breaks)

---

## What's New in This Version (v1.1)

**Max 4000 chars. Shown to existing users on update; new users see the
full description above.**

```
v1.1 makes OSPOS work for coffee shops, food trucks, taco stands, and
any counter-service business with customizable items.

NEW

• Modifier groups — build "Choose your milk" as required single-select,
  "Add toppings" as multi-select with a max, with defaults that pre-fill
  the customize sheet
• Customize from cart — tap any cart line's Customize button to reopen
  the sheet and edit modifiers without re-ringing
• Sold-out toggle — mark items or modifiers 86'd today without
  deleting them; toggle back when you restock
• Order-level discounts — % off or $ off with an optional reason
• Per-item taxable flag — mix prepared food and packaged retail in
  the same menu with the right tax behavior on each
• QSR mode (opt-in in Settings) — adds a category filter above your
  menu for businesses with many items
• Sticker library expanded from 46 to 193 — Microsoft Fluent Emoji
  Flat across food, drinks, retail, and service
• Menu rows now show item stickers as thumbnails
• Receipts now indent modifier lines under their item and show
  discount lines above tax
• Adaptive cart panel grows as you ring items in
• 18% tip preset added to the card payment screen
• Several small bug fixes around modifier search and double-tap
  ringing

Thanks for using OSPOS. Send feedback to phil@tttships.co.
```

(~1,400 chars)

---

## Keywords (max 100 chars, comma-separated)

**This is what powers App Store search ranking. Use every char.**

> pos,point of sale,tap to pay,register,square,cash register,coffee shop,food truck,restaurant

(93 chars — covers the top organic-search terms a small merchant would type)

Alternative if you want more "open source" search hits:

> pos,tap to pay,register,square,open source,coffee shop,food truck,stripe,1 percent,small biz

(91 chars — trades "restaurant" + "cash register" for "open source" + "stripe" + "small biz")

**Recommendation:** ship the first version. "Open source" search volume
is tiny compared to "POS" and "register." Save the open-source angle
for v1.2's launch posts where the audience is already aligned.

---

## Support URL / Marketing URL

Leave as-is from v1.0:
- Support URL: https://ospos.app/help
- Marketing URL: https://ospos.app
- Privacy Policy URL: https://ospos.app/privacy

---

## App Review Notes (for Apple)

**Demo account is unchanged from v1.0. Re-state these so the reviewer
can find them without digging:**

```
Demo merchant account (Tap to Pay on iPhone testing):

Email: appstore-review@tttships.co
Password: crNrrLmUwNBUHBWKiuaNPUpD

This account is configured with a live Stripe Connect Standard
account and a Terminal location. Charges over $1.00 are rejected
server-side with a clear error message to prevent accidental
billing during review — please test with charges of $1.00 or less.

To test Tap to Pay on iPhone end-to-end:
1. Sign in with the demo credentials above
2. The app skips onboarding (it's already set up)
3. Go to the Order tab, ring up an item under $1.00
4. Tap the Charge button → Card
5. The Tap to Pay on iPhone system sheet appears
6. Use any contactless card to test

What's new in this submission (v1.1):
• Modifier groups for items with customizable options
• Customize sheet for ringing items with modifiers
• 86'd / sold-out toggle for items and modifiers
• Order-level discounts and comps
• QSR mode (category filter — opt-in in Settings)
• Expanded sticker library
• Per-item taxable flag

No changes to the Tap to Pay on iPhone flow, the Stripe Connect
onboarding flow, the auth flow, or any payment-handling code.

Contact for questions: phil@tttships.co
```

---

## Submission checklist (paste into App Store Connect)

- [ ] Bump version to 1.1.0 in App Store Connect (build 33 should be available after TestFlight processing)
- [ ] Update "What's New in This Version" with the block above
- [ ] Update Promotional Text
- [ ] Confirm Subtitle (pick one of the three options)
- [ ] Confirm Keywords (pick one of the two options)
- [ ] Update App Description if you want the QSR-ready angle
- [ ] Upload new App Store screenshots (modifier groups, customize sheet, QSR mode, sticker picker)
- [ ] Paste App Review Notes
- [ ] Submit build 33 for review

Apple's review window typically runs 1-3 days. To hit 2026-06-15 release,
submit by 2026-06-12 at the latest (3-day buffer). 2026-06-13 is the hard
deadline (1-day buffer).
