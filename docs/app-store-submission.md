# App Store Submission Requirements (2026)

## Developer Account & Legal
- [x] Apple Developer Program ($99/year) — active, philtzamarripa@gmail.com
- [ ] Tax and banking info in App Store Connect
- [ ] EU trader status (if distributing in EU)

## Technical Requirements
- [ ] Built with Xcode 26 + iOS 26 SDK (required after April 2026 deadline)
- [x] 64-bit only
- [ ] Updated age rating questions (new system for 2026)
- [x] Supports current screen sizes + Safe Area
- [x] Dark mode supported (userInterfaceStyle: "dark")
- [x] Sign in with Apple offered (implemented)
- N/A Digital goods IAP (OSPOS processes physical payments, not digital goods)
- [x] Account deletion available (implemented)
- [x] Not a web wrapper (native React Native app)
- [ ] Privacy Nutrition Labels in App Store Connect
- [ ] Required Reasons API declarations (check third-party SDKs)

## App Store Connect Metadata
- [ ] App name, subtitle, description
- [ ] Keywords
- [ ] Screenshots: 6.9", 6.7", 6.5", 5.5" iPhone (+ iPad if supporting)
- [ ] App preview videos (optional but recommended)
- [x] App icon 1024x1024 (no alpha, no rounded corners) — updated icon in assets/brand/
- [ ] Privacy policy URL (ospos.app/privacy)
- [ ] Support URL (ospos.app/help)
- [ ] Category selection (Finance or Business)
- [ ] Age rating questionnaire
- [ ] Pricing and availability

## Before Submit
- [ ] Remove all placeholder/temporary content
- [ ] Demo account for Apple reviewer
- [ ] Test on physical devices
- [ ] All URLs functional (privacy policy, support)
- [ ] No crashes or obvious technical problems
- [ ] TTPOi entitlement review passed (Case-ID: 18719391)

## OSPOS-Specific Notes
- Stripe processes physical card payments — NOT digital goods, so IAP not required
- App name cannot include "Tap to Pay on iPhone" (Apple guideline 5.2.5)
- Must provide test account + video walkthrough for TTPOi review
- Phased release recommended for launch
- Required Reasons API: check expo-sqlite, AsyncStorage, expo-secure-store for API usage declarations
