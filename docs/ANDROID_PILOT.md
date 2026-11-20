# KZ Home: Android pilot

One implementation: the same React screens, API types, authentication, Core repositories, command IDs and ACK/state rules as the browser. The app bundles the Web build in Capacitor. It never loads a remote page in the native bridge.

## What the pilot can reach

Enter an HTTPS origin such as `https://192.168.1.20:8443` on the same trusted home Wi-Fi. That is an example, not the configured owner address. The existing `127.0.0.1:39225` remains local to the Windows computer and is not a phone address. The pilot accepts private IPv4 addresses only. Core needs an independently prepared LAN-only HTTPS endpoint; it must not be exposed to the Internet. Do not change the working launcher, Docker, or firewall from this repository.

The ordinary APK uses Android system trust. A private IPv4 endpoint generally needs a private CA. An administrator can create a **personalized pilot debug APK** whose Android Network Security Configuration adds precisely that public CA for just the named private IPv4 address. This does not permit cleartext, hostname mismatch, or an arbitrary user root. The TLS leaf must chain to that CA, be valid, and contain the exact IP as an IP SAN. Verify the CA fingerprint through a trusted channel before packaging. Do not upload CA private keys, leaf private keys, APK signing keys or live credentials. Demo/CI trust roots must not be included in an owner delivery.

## Build the test APK

Use Node 24, JDK 21 and official Android SDK platform/build-tools 36. On a clean checkout:

```bash
npm ci
npm run typecheck && npm run lint && npm test
npm run android:sync
(cd android && ./gradlew --no-daemon assembleDebug)
```

For the approved local-Certificate variant only, generate an overlay into a new scratch directory (the CA file is the **public** root; keep its private key elsewhere):

```bash
overlay="$(mktemp -d)/res"
python3 scripts/android-pilot-trust.py --host 192.168.1.20 --ca /trusted/path/home-public-ca.pem --output "$overlay"
(cd android && ./gradlew --no-daemon -PkzHomeTrustDir="$overlay" assembleDebug)
```

Result: `android/app/build/outputs/apk/debug/app-debug.apk`. Confirm its SHA256 and signing certificate before installation; separately issued debug builds may have different signing keys. Do not clear existing app data just to force an update. No store release is involved.

## Session and connection

After an anonymous TLS health check, sign in to the shared Core. The selected house is bound to that endpoint and account; access is rechecked against server house membership on each login. The password and access token are RAM-only. Android encrypts only the rotating refresh token and chosen house/address using Android Keystore; the previous refresh token is taken out before rotation, never retried after an uncertain response. Sign-out removes the key/token locally before attempting server revocation. A failed key operation or uncertain refresh requires a fresh login. Switching address clears the previous endpoint binding and any saved token. Desktop browser sessions remain memory-only.

No queued command or automatic mutation retry is added. Android networking explicitly requires Wi-Fi; after resume or reconnect, the shared client refetches active **read** queries. An in-flight command may already have reached Core; when it cannot be confirmed, do not infer success or resend on reconnect. Check Core state and journal. A private IP can be reachable on other Wi-Fi networks; only a TLS identity trusted for that exact address can complete the connection.

## Acceptance checklist (do not claim before evidence)

1. Install exact APK in an Android emulator, connect it and desktop Web to the same real pinned Core with program relay, no physical hardware.
2. Login and open the room; switch ON/OFF, verify acknowledged state on desktop, favorite shared in same user/house, run existing `Ушёл из дома`, and verify the journal.
3. Verify rotation after force-stop/launch, expiry and logout, keyboard, system Back, background during a command and Wi-Fi down/up with no additional command; reject wrong/untrusted certificates and HTTP.
4. Keep separately recorded what is built, emulator-verified, and owner physical-phone verified. Web-only checks do not constitute an APK acceptance.
