# Apple TTPOi Dual-Device Architecture — Compliance Inquiry

**Status:** ON HOLD — DO NOT SEND (as of 2026-06-02)
**Reason on hold:** Strategic decision to ship via TestFlight instead of asking permission first. See `project_dual_device_killer_idea` memory for full reasoning. This draft is preserved as a defensive document only — used if Apple later challenges us, to demonstrate that we drafted a compliance question, reviewed the terms, and chose to build on what was permitted.
**Recipient (if ever sent):** Reply to Apple TTPOi entitlement thread (Case-ID 18719391)
**Escalation channel (if ever sent):** developer.apple.com → Contact Us → Technical Support Incident (uses 1 of 2 free TSIs per year)
**Author:** Phil Tzamarripa, TTTS Co. LLC
**Drafted:** 2026-06-02

---

## What this is for

Before investing in production development of a dual-device architecture
(iPad UI + paired iPhone reader for Tap to Pay on iPhone), we want a
written compliance opinion from Apple. The architecture appears unblocked
by the public Tap to Pay on iPhone Platform Terms and Conditions, but
the pattern is not directly addressed and we want it on the record.

## Email draft

**To:** [reply to existing TTPOi entitlement thread]
**Subject:** Tap to Pay on iPhone — guidance request on multi-device architecture (OSPOS / TTTS Co. LLC)

---

Hi Apple Tap to Pay team,

I'm writing to request guidance on whether a specific architecture for Tap to Pay on iPhone complies with the Tap to Pay on iPhone Platform Terms and Conditions.

**Context.** Our app, OSPOS (Apple App ID 6766436501; TTPOi Entitlement Case-ID 18719391), is a point-of-sale app currently shipping Tap to Pay on iPhone via the Stripe Terminal SDK as our certified PSP integration. The app is live on the App Store as of 2026-05-31.

**Proposed architecture.** We are considering an optional "dual-device" mode where a merchant uses two of their own Apple devices in concert:

- An iPad runs OSPOS as the counter-facing UI (order entry, item display, totals, receipt screen).
- An iPhone XS or newer (the Enabled Device) runs OSPOS in a "reader" role and performs the ProximityReader / Stripe Terminal `collectPaymentMethod` call.
- The two devices are paired via Apple's Multipeer Connectivity framework.
- When the merchant taps "Charge $X" on the iPad, the iPad sends a charge command to the paired iPhone over Multipeer. The iPhone foregrounds the OSPOS app, initiates a Tap to Pay session, the customer taps their card on the iPhone (the Enabled Device), and the iPhone returns the result to the iPad for receipt display.

The iPhone remains the only device performing the contactless read; the iPad never touches NFC or any payment cryptography. The Stripe Connect merchant account, the ProximityReader entitlement, and all certified payment flow continue to run exclusively on the Enabled iPhone.

**Customer-trust safeguards we plan to build in:**

- Devices must be paired in person via on-screen verification codes shown on both devices
- Multipeer's native Bluetooth/Wi-Fi range (~10m) naturally constrains physical distance; we will also enforce a stricter <2m RSSI cap
- The iPhone displays the charge amount in large type during the entire tap window
- The iPhone provides haptic + audio feedback when entering the tap-ready state
- Each transaction shows a 4-digit match code on both devices so the merchant can confirm correct pairing before tapping
- A 60-second timeout on the tap-ready state to prevent stale charges

**Specific question.** Does the architecture above violate any clause of the Tap to Pay on iPhone Platform Terms and Conditions? In particular, we want to confirm:

1. The "softPOS Mobile App" and "Enabled Device" usage requirements — the iPhone remains the sole Enabled Device performing the contactless read; the iPad is purely a UI controller on the merchant's own infrastructure.
2. The prohibition on "interfering with or disrupting the Tap to Pay on iPhone Platform (including by accessing the Tap to Pay on iPhone Platform through any automated means)" — every transaction is explicitly initiated by a human merchant tapping a button on the iPad; there is no automation.

We have not yet developed a production implementation. We would prefer to confirm compliance before investing in the work. We can provide a small functional prototype on request.

Thank you in advance for any guidance you can provide.

Best,
Phil Tzamarripa
TTTS Co. LLC
phil@tttships.co

---

## Expected response patterns

| Apple says | What it means |
|------------|---------------|
| "Yes, this complies, provided X" | Green light. Build it. Document X. |
| "No, this violates clause Y" | Redesign required. We know what to avoid. |
| "We cannot provide legal advice; consult counsel" | Soft yes (no specific objection). Build with care. |
| Silence after 14 days | File TSI with the same draft. After two channels of silence: reasonable basis to build a prototype and continue to dialogue. |

## After response

- Update [[project_dual_device_killer_idea]] memory with the verdict
- If green: trigger v1.3 production build plan (see [[project_v1_0_vs_v1_1_split]])
- If red: archive this idea, refocus v1.3 on something else (likely tables/kitchen tickets pulled forward from v2)
