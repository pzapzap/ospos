# Apple Tap to Pay on iPhone Requirements (v1.5, March 2025)

Case-ID: 18719391 | Contact: ttpoientitlements@apple.com (Cherie, Wallet Entitlements — Avinash rotated out Apr 2026)

## Entitlement Process
1. Development entitlement ✅ (granted, dev profiles only)
2. Publishing entitlement — requires video review submission
3. App Store Review — standard + TTPOi-specific review

## Video Deliverables (record with ANOTHER device, not screen recording)
1. New User Flow video
2. Existing User Flow video
3. Checkout Flow video
4. Completed App Review Requirements Checklist (.numbers file)

Upload via Apple's File Uploader, reply to Case-ID email.

## General Requirements (Section 1)
- 1.1 Required: Only offer TTPOi on compatible devices (iPhone XS+)
- 1.2 Required: iOS Deployment Target = minimum for TTPOi
- 1.3 Required: Handle PaymentCardReaderError.osVersionNotSupported
- 1.4 Required: Warm up TTPOi at app launch / foreground
- 1.5 Conditional: If sole payment method, require `iphone-ipad-minimum-performance-a12` in UIRequiredDeviceCapabilities
- 1.6 Required: T&C acceptance status from Apple, not local variable
- 1.7 Recommended: FaceID/TouchID for merchant login at checkout
- 1.8 Conditional: Adhere to HIG
- 1.9 Conditional: Adhere to TTPOi Marketing Guidelines

## Onboarding Merchants (Section 2)
- 2.1 Required: Account creation easily discoverable for new users
- 2.2 Required: Digital onboarding fully completable on iPhone
- 2.3 Required: Onboarding < 15 minutes

## Enabling TTPOi (Section 3)
- 3.1 Required: Highly-visible communications about TTPOi availability
- 3.2 Recommended: Full-screen modal (splash) for TTPOi awareness
- 3.3 Required: Display TTPOi communications to ALL eligible users at least once (push notification counts)
- 3.4 Required: Obvious way to enable TTPOi at END of new merchant onboarding
- 3.5 Required: Clear action to trigger T&C acceptance
- 3.6 Required: Way to enable TTPOi outside checkout (e.g. settings)
- 3.7 Required: Trigger to enable TTPOi within or before checkout flow
- 3.8 Required: T&C only accepted by admin/authorized party
- 3.8.1 Required: Non-admin message to contact admin
- 3.9 Recommended: After T&C + education, dedicated "try it" screen
- 3.9.1 Required: Configuration progress indicator during device setup

## Educating Merchants (Section 4)
- 4.1 Required: Education screens AFTER T&C acceptance
- 4.2 Required: Education accessible in Settings or Help
- 4.3 Required: Use Apple-approved marketing assets (or ProximityReaderDiscovery on iOS 18+)
- 4.4 Required: Demo how to accept contactless cards
- 4.5 Required: Demo how to accept Apple Pay + digital wallets
- 4.6 Conditional: PIN entry education (US = yes, required for all regions except JP, TW)
- 4.7 Conditional: Fallback payment method education (UK, IE, CAN only)

### Implementation (post–Apr 2026 review)
Cherie rejected the first submission's education screens (static SF Symbols +
text were not a "demonstration" per 4.4 / 4.5). We now use Apple's
`ProximityReaderDiscovery.presentContent(_:from:)` on iOS 18+, bridged via the
local Expo module at `modules/ttpoi-native/`. Legacy 3-slide carousel remains
as the fallback for Android and iOS < 18.
- iOS 18+ branch: `src/components/TTPOiEducation.tsx` → `AppleEducation` auto-presents the system overlay on mount.
- "Watch the guide again" button re-presents it on demand, which also covers 4.2 (accessible from Settings).

## Checking Out (Section 5)
- 5.1 Required: Obvious, prominent TTPOi button during checkout
- 5.2 Required: Button visible without scrolling, top of payment options
- 5.3 Required: Button never grayed out/hidden even if TTPOi not yet enabled
- 5.4 Conditional: Correct localized copy for button (US = "Tap to Pay on iPhone")
- 5.5 Conditional: Use wave.3.right.circle SF Symbol if using iconography
- 5.6 Required: "Processing" screen after successful card read
- 5.7 Required: Clear outcome communication (approved/declined/timed out)
- 5.8 Required: Digital receipt capability (SMS, email, QR)
- 5.9 Conditional: Regional compliance
- 5.10 Conditional: Non-authorized user message

## Marketing (Section 6)
- 6.1 Required: Dedicated launch email (Apple template)
- 6.2 Required: In-app splash screen (Apple "Hero" banner template)
- 6.3 Required: Push notification (Apple "Value Proposition" copy)

## Regional (US only for OSPOS)
- Button text: "Tap to Pay on iPhone" (long) / "Tap to Pay" (short)
- PIN Entry in Education: Required
- No fallback payment method required (US)
- No surcharging requirement (US)
- No IFR requirement (US)

## App Store Submission Notes
- Do NOT use "Tap to Pay on iPhone" in app name (violates guideline 5.2.5)
- Must provide: test user account, video walkthrough sign-in to checkout, high-fidelity wireframes
- Phased release recommended
