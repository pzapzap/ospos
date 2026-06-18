# Connecting Stripe to OSPOS

**Handoff document for the OSPOS website team.** This file is the canonical content for the page that will live at `ospos.app/connect-stripe`. The visual design, hosting, and HTML conversion are owned by the website instance — this file owns the words.

**Voice:** plain, friendly, anti-confusion. The reader is a real merchant — coffee cart, food truck, market vendor — who hit a wall on a Stripe form field and wants to know if they should keep going. Reassure without overselling. No marketing puffery.

**Critical guardrails baked into the copy below — preserve when adapting to HTML:**
- Never imply OSPOS is part of Stripe
- Never give tax or legal advice
- Be explicit that OSPOS doesn't touch the money (Stripe → bank, direct)
- Match the 1% / no-monthly-fee positioning from the App Store listing
- Mirror OSPOS's voice (terse, plain language, no marketing jargon)
- The Instagram URL workaround is the single most valuable thing on this page — keep it prominent

---

## PAGE CONTENT STARTS HERE

# Connecting Stripe to OSPOS

OSPOS uses Stripe to handle card payments. It's the same processor Substack, Lyft, and Slack use. Connecting takes about 5 minutes if you have your info handy. You can also skip it forever and run on cash only — that's free and always will be.

This page walks you through what Stripe will ask for and the common confusions that trip people up.

---

## Why connect at all?

You don't have to. Cash mode works forever, no signup required, no card fees.

You'd connect Stripe if you want to:

- **Accept card payments** — most merchants see larger average tickets when customers can tap instead of fumble for cash
- **Use Tap to Pay on iPhone** — your iPhone becomes a card reader (no extra hardware)
- **Accept Apple Pay, Google Pay, and contactless cards** — same flow as a tap

OSPOS adds a 1% fee on top of Stripe's standard processing rate (2.7% + 5¢ in-person for US cards). There's no monthly fee, no contract, and no fee on cash sales. Ever.

---

## What you need ready (about 5 minutes)

Have these handy before you start:

1. **Your business name** — your real name plus a "DBA" (doing business as) name if you have one. "Jane Smith DBA Coffee Cart" is fine.
2. **EIN OR Social Security Number** — Stripe accepts either. The EIN is for registered businesses; the SSN is for sole proprietors and individuals. Either works for tax reporting.
3. **Business address** — your home address is fine if you don't have a storefront.
4. **Bank account info** — routing number + account number where Stripe will deposit your payouts.
5. **A "business website"** — see the next section if you don't have one. *Most of our merchants get stuck here. Read it.*

---

## "I don't have a business website" — what to put

This is the field that trips up the most merchants. **Stripe accepts a social profile URL.** Any of these work:

- **Instagram** — your business profile URL (`instagram.com/yourshop`) is what most coffee shops, food trucks, and market vendors use.
- **Facebook** — your business page URL
- **Yelp** — your business listing URL
- **Etsy** — your shop URL
- **LinkedIn** — your business or personal page

Paste one of those into the "Business website" field. Stripe doesn't require a dedicated `.com`. We've never seen a merchant get rejected for using a social profile.

If you don't have any of these, set up an Instagram profile in 60 seconds — that's the path of least resistance.

---

## What Stripe will ask you

When you tap "Connect Stripe" in OSPOS, you'll hand off to Stripe's website in Safari. You're filling out their form, not ours. The screens go roughly like this:

1. **Email + phone** — Stripe sends you a verification code; type it in.
2. **Business details** — name, type (sole prop / LLC / corp), industry (pick "restaurant" or "specialty retail" — whatever fits), and that website field we just talked about.
3. **Personal details** — your name, date of birth, last 4 of SSN (or full SSN for sole props). This is tax reporting (1099-K) — standard for any payment processor.
4. **Bank account** — routing + account numbers.
5. **Review and submit.**

You'll come back to OSPOS automatically when you're done.

---

## How long it takes after you submit

- **Most merchants:** instant approval. You can ring your first card transaction in 30 minutes.
- **Some merchants:** 1-3 business days while Stripe verifies your bank or business documents. They'll email you if they need anything else.
- **Rare cases:** Stripe asks for additional verification — usually a driver's license photo or a utility bill. Upload via the Stripe dashboard.

OSPOS doesn't have visibility into Stripe's verification queue. If you're stuck, you can email Stripe support directly at `support@stripe.com` or chat with them via your Stripe dashboard.

---

## After connecting

- **Tap to Pay activates automatically.** No extra setup. Your iPhone is now the card reader.
- **Your money flows direct.** Customer → Stripe → your bank. OSPOS never touches the funds.
- **OSPOS's 1% gets deducted automatically.** You'll see Stripe's standard rate + our 1% on each charge, deducted before payout.
- **You can revoke OSPOS access anytime.** Stripe dashboard → Settings → Connected applications → OSPOS → Disconnect. Your Stripe account stays; only our access to it gets cut.

---

## Common confusions

**"Why does Stripe need my SSN?"**
Tax reporting. Any company that processes payments in the US has to issue you a 1099-K at year-end if you cross a threshold. Stripe needs your SSN to do that. Same rule for Square, PayPal, Venmo, every payment processor. It's federal.

**"Why a separate Stripe account? Why not just take cards through OSPOS?"**
Because the money goes from your customer's bank to your bank — never through us. That's better for you (no risk of OSPOS holding your money) and better for compliance (we're not a money transmitter). Stripe is the rails; OSPOS is the cash register that sits on top.

**"Is there a monthly fee?"**
No. Stripe's standard rate (2.7% + 5¢ in-person for US cards) plus OSPOS's 1%, only when you charge a card. Cash sales: free, forever, no fee. Nothing per month.

**"What if I want to switch back to cash-only later?"**
You can. In OSPOS, go to Settings → and switch tier. Your Stripe account stays connected; we just stop using it. Or revoke our access from your Stripe dashboard and we're fully disconnected.

**"Can I use my personal bank account?"**
Yes, especially if you're a sole proprietor. Stripe doesn't require a business bank account. You may want one for tax/bookkeeping cleanliness, but it's not a Stripe requirement.

**"What if I'm not in the US?"**
Today OSPOS is US-only. Other countries are on the roadmap (Canada, UK, Australia, New Zealand, Singapore, Ireland next). If you're outside the US, sign up anyway — you'll be among the first to get the country expansion.

---

## Stuck on something not covered here?

Email **phil@tttships.co**. He's the founder, he reads everything, and he wants to know where you got stuck — that feedback directly improves the next version of OSPOS.

---

## PAGE CONTENT ENDS HERE

**Note to the website team:**
- The page should be mobile-first; most merchants will read this on their phone right after tapping "Continue to Stripe" in the app.
- Cross-link from `ospos.app/help` and any in-app "need help?" surfaces.
- Suggested URL: `ospos.app/connect-stripe`.
- Brand colors / fonts: match the existing ospos.app site (Bitter for headings, Archivo for numbers/UI, dark theme).
- No paywall, no signup, no analytics tracking on this page beyond whatever site-wide.
