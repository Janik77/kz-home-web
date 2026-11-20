# KZ Home mobile release gates

This is preparation only. Do not open paid accounts, use release keys, register identifiers, upload a build, or submit for review without separate owner approval. A signed debug APK is an installable test artifact, not Google Play or App Store readiness. Treat the current Android application ID as a pilot identity until production identity and upgrade strategy are agreed.

## 1. Qualify the pilot first

- Pin Core and Web/native source, schema, Android System WebView/OS, and the test build certificate fingerprint. Align with the accepted software-only pilot; all device mutations use the same shared Core contract.
- Install in Android emulator, then on an owner-approved real phone. Check stable LAN-only TLS, account refresh rotation, Android Keystore, expiry/logout, system Back, login keyboard, safe areas, and offline resume. Test rekeying/address change and no replay before changing a reliable endpoint.
- Capture one short screen recording showing Android → confirmed program relay state → same state in browser. Test favorites, scene results and journal on the same user and house. Keep owner credentials, CA keys and local addresses out of the recordings and artifacts.

## 2. Android internal release candidate

- Freeze production package identity and supported Android versions. Run a release-mode build with `./gradlew :app:bundleRelease` in CI **unsigned** (or with a disposable non-production key only for local package tests) first. AAB is a distribution format, not an APK a user installs directly.
- Production uses a separate controlled upload key and [Play App Signing](https://developer.android.com/studio/publish/app-signing) with a separately managed release identity. An ephemeral debug signer is not an upgrade path for the store app. Do not commit any key, password, keystore or local CA private material.
- Qualify signed internal-test install/update, refresh and LAN certificates on multiple devices, then decide closed testing/review. Recheck active Play policy and target SDK before submission.
- Prepare Play listing text and accurate screenshots, [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469), privacy policy and account/support instructions. Declare the real data path, including remote demo only if deliberately added; do not invent telemetry.

## 3. Native iOS candidate

- Extend this Capacitor codebase using its iOS target, not a new front end. Add Swift Keychain for rotating credentials and appropriate access class, Wi-Fi/background resume, keyboard and safe-area checks, VoiceOver, and a justified local network permission explanation. Validate App Transport Security/hostname policy and a maintainable private LAN CA path without trust-all or cleartext exceptions.
- Use an authorized Mac/Xcode environment for real iOS builds and iPhone acceptance; Safari and iOS Simulator are useful but not substitutes for installed iOS functionality on a phone. Check [Apple's current Xcode/SDK upload requirements](https://developer.apple.com/news/upcoming-requirements/) at submission, not just Capacitor's development minimum.
- When approved, use a separate iOS bundle ID, provisioning, controlled release signing and [TestFlight](https://developer.apple.com/testflight/) ahead of App Review. No signing certificate or account credential enters the repository.

## 4. Review without exposing the owner's home

- The store product needs demonstrable installed-app value, not just a repackaged website: secure home pairing and saved home, native secure credential handling, lifecycle/network recovery, accessibility, and verified shared device control. See [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (including minimum functionality and review access).
- Plan a clearly labelled reviewer demo with synthetic homes, isolated software devices, revocable least-privilege access, and no routing to or access to the owner's LAN. No physical device commands. For an online demo, require a separate explicit release decision and operate it independently of the owner installation. Provide review notes or an agreed full-featured demo as appropriate, not an unreviewable manual private IP. Do not publicize this pilot or open router ports.
- Build a shared checklist per version: pairing → login → room → command receipt and confirmed state → cross-device read → favorites → scene → journal → offline/reconnect → logout. Track APK/emulator, real Android, iOS Simulator/Safari, and real iPhone separately. Store-ready is a later gate, not a label on today's debug build.
