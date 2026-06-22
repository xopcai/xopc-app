# xopc

Standalone Expo (React Native) app for the [xopc](https://github.com/xopcai/xopc) gateway. Run an xopc gateway (HTTP/WebSocket) with your API keys and optional token auth; configure the app to point at that gateway base URL.

**Remote access (FRP):** LAN-first routing with broker-terminated TLS on `*.frp.xopc.ai`; remote API calls use HTTPS + gateway Bearer token after QR pairing (`ps`).

## Start here

- Main project: [xopcai/xopc](https://github.com/xopcai/xopc)
- Mobile app guide: [xopc docs — Mobile app](https://xopcai.github.io/xopc/mobile-app)
- Remote access guide: [xopc docs — Remote access](https://xopcai.github.io/xopc/remote-access)

If xopc helps you keep long-term AI work moving across terminal, web, desktop, mobile, and messengers, please star the main repo: [github.com/xopcai/xopc](https://github.com/xopcai/xopc).

## How it connects

1. Start `xopc gateway` on the machine that holds your xopc config and model credentials.
2. In the gateway console, open **Settings → Remote access**.
3. Choose LAN, FRP public tunnel, Tailscale Serve, or your own HTTPS reverse proxy.
4. Use **Mobile app pairing** to scan the QR, or set the gateway base URL and optional bearer token in app settings.

## Layout

- App source: `app/` (Expo Router), `src/`, `app.json`, `metro.config.js`.
- `packages/gateway-sse-client/` — workspace package `@xopcai/gateway-sse-client` (agent SSE parsing).

## Prerequisites

- Node.js 22+
- [pnpm](https://pnpm.io/) 9.x

## Commands

| Script | Description |
|--------|-------------|
| `pnpm start` | Expo dev server |
| `pnpm run android` / `pnpm run ios` / `pnpm run web` | Platform targets |
| `pnpm run android:release` | Android release APK (arm64, minified — smaller install) |
| `pnpm run lint` | ESLint |
| `pnpm run typecheck` | TypeScript (app + gateway-sse-client) |
| `pnpm run test:gateway-sse-client` | Vitest for SSE client |

## MMKV and Expo Go

[`react-native-mmkv`](https://github.com/mrousavy/react-native-mmkv) uses native code. **Expo Go** does not ship this module; the app falls back to in-memory storage (settings are lost on restart).

For persistent storage, use a **development build**:

```bash
pnpm exec expo prebuild
pnpm run ios:no-proxy
# or: pnpm exec expo run:android
```

### iOS CocoaPods (slow installs / proxy)

If `expo run:ios` hangs on **Installing CocoaPods…**, system HTTP proxies often slow `pod install` and trigger Node `[UNDICI-EHPA]` warnings. This repo:

- Injects a **Tsinghua CocoaPods Specs mirror** at prebuild (`plugins/with-ios-cocoapods-mirror.js`), similar to Android’s Aliyun Maven mirrors.
- Provides scripts that clear proxy env vars and prefer Homebrew’s `pod`:

```bash
pnpm exec expo prebuild          # or prebuild --clean after plugin changes
pnpm run pods:install            # pod install in ios/ without proxy
pnpm run ios:no-install          # build/run after pods are already installed
# or one step:
pnpm run ios:no-proxy
```

## LAN gateway access

Local gateways often use `http://` on LAN IPs (for example `http://192.168.1.44:18790`). **Expo Go** can reach LAN more easily because it runs inside Expo’s own app shell. **Standalone iOS/Android builds** use your app’s native permissions and network policy — behavior can differ from Expo Go even on the same phone and Wi‑Fi.

The app probes LAN vs FRP in **Settings → Gateway → Connection status** and prefers LAN when `/health` succeeds.

### Android (HTTP cleartext)

Standalone Android builds block HTTP by default (Android 9+). This project enables it via the `expo-build-properties` plugin with `android.usesCleartextTraffic: true`. After changing native network settings, run a fresh build:

```bash
pnpm exec expo prebuild --clean
pnpm exec expo run:android
```

If LAN worked in Expo Go but fails in a release/dev-client APK, rebuild the Android app — cleartext is applied at **prebuild** time, not at runtime.

### Android APK size

Release builds use `expo-build-properties` to keep install size down:

- **arm64-v8a only** — modern phones; drops armeabi-v7a / x86 / x86_64 from the APK
- **R8 minify + resource shrinking** — release variant only

After changing these settings in `app.json`, regenerate native projects and build release:

```bash
pnpm exec expo prebuild --clean
pnpm run android:release
```

For internal distribution via EAS, `preview` profile produces a release APK; `production` produces an **AAB** for Play Store (Play serves per-device slices, often ~45–60MB download).

Package id is `ai.xopc.xopc`. Uninstall older builds under `com.anonymous.xopcapp` — Android treats them as separate apps.

### iOS (local network + ATS)

Standalone iOS builds include, via `app.json` → `ios.infoPlist`:

- `NSAppTransportSecurity.NSAllowsLocalNetworking` — allows HTTP to local IPs such as `192.168.x.x`
- `NSLocalNetworkUsageDescription` — required for the iOS 14+ **Local Network** privacy prompt

These keys are written into `Info.plist` during `expo prebuild`. Unlike Android, iOS does **not** need a separate cleartext manifest flag when `NSAllowsLocalNetworking` is set.

On first LAN access, iOS shows a system dialog (“Allow xopc to find devices on your local network?”). **Expo Go and your standalone app are different bundle IDs** — allowing access in Expo Go does not grant it to an installed `xopc` build.

If LAN shows unreachable after install:

1. Open **Settings → Privacy & Security → Local Network** and enable **xopc**
2. Confirm the phone and gateway are on the same Wi‑Fi
3. In the app, open gateway settings and tap **Re-detect route**

Rebuild after changing `app.json` iOS plist entries:

```bash
pnpm exec expo prebuild --clean
pnpm run ios:no-proxy
```

## Configure

Open **Settings** in the app: set gateway base URL (no trailing slash) and optional bearer token (must match `gateway` auth in `xopc.json`).

## License

MIT (match xopc main repo unless stated otherwise).
