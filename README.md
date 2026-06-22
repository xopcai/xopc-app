# xopc Mobile

English | [简体中文](./README.zh-CN.md)

Expo mobile client for the [xopc](https://github.com/xopcai/xopc) gateway. The app connects to a user-hosted gateway over HTTP/WebSocket, with LAN-first routing and optional FRP remote access after QR pairing.

The mobile client is designed as a calm, content-first workspace for notes, inbox triage, assistant conversations, and automation control. Visual and interaction standards live in [DESIGN.md](./DESIGN.md).

## Quick Links

- Main project: [xopcai/xopc](https://github.com/xopcai/xopc)
- Mobile app guide: [xopc docs - Mobile app](https://xopcai.github.io/xopc/mobile-app)
- Remote access guide: [xopc docs - Remote access](https://xopcai.github.io/xopc/remote-access)
- Design language: [DESIGN.md](./DESIGN.md)

If xopc helps you keep long-running AI work moving across terminal, web, desktop, mobile, and messengers, please star the main repo: [github.com/xopcai/xopc](https://github.com/xopcai/xopc).

## How the App Connects

1. Start `xopc gateway` on the machine that has your xopc config and model credentials.
2. Open the gateway console and go to **Settings -> Remote access**.
3. Choose a route: LAN, FRP public tunnel, Tailscale Serve, or your own HTTPS reverse proxy.
4. Pair the mobile app with the gateway QR code, or enter the gateway base URL and optional bearer token in app settings.

Remote access uses LAN-first routing. When FRP is enabled, broker-terminated TLS serves `*.frp.xopc.ai`; remote API calls use HTTPS plus the gateway bearer token after QR pairing.

## Tech Stack

| Area | Stack |
|---|---|
| Runtime | Expo SDK 56, React Native 0.85, React 19 |
| Routing | Expo Router |
| Server state | TanStack React Query |
| Client state | Zustand |
| Storage | react-native-mmkv, with web/local fallback |
| UI | react-native-paper plus project design tokens |
| Gestures and motion | react-native-gesture-handler, react-native-reanimated |
| Keyboard | react-native-keyboard-controller |
| Lists | FlashList for long/high-update lists |
| Validation | zod, react-hook-form |
| Tests | Vitest |

## Repository Layout

```text
app/                         Expo Router routes
src/                         Features, components, API, query, theme, stores
src/theme/                   Design tokens and Paper theme mapping
src/i18n/                    Localized message bundles
src/storage/                 MMKV and fallback storage
packages/gateway-sse-client/ Workspace package for gateway SSE parsing
plugins/                     Expo config plugins
app.json                     Expo native configuration
eas.json                     EAS build profiles
```

## Requirements

- Node.js 22+
- pnpm 9.x
- A running xopc gateway for real device usage
- Xcode and CocoaPods for iOS native builds
- Android Studio / Android SDK for Android native builds

## Install

```bash
pnpm install
```

## Development

```bash
pnpm start
```

Common scripts:

| Script | Description |
|---|---|
| `pnpm start` | Start the Expo dev server |
| `pnpm start:no-proxy` | Start Expo with proxy environment variables cleared |
| `pnpm run android` | Build and run Android |
| `pnpm run ios` | Build and run iOS |
| `pnpm run ios:no-proxy` | Build and run iOS with proxy variables cleared |
| `pnpm run web` | Start Expo web |
| `pnpm run lint` | Run ESLint on `app` and `src` |
| `pnpm run typecheck` | Type-check the app and SSE workspace package |
| `pnpm test` | Run the Vitest suite |
| `pnpm run test:gateway-sse-client` | Run SSE client tests |

## Configure the Gateway

Open app settings and configure:

- Gateway base URL, without a trailing slash.
- Optional bearer token, matching gateway auth in `xopc.json`.

Examples:

```text
http://192.168.1.44:18790
https://your-name.frp.xopc.ai
https://xopc.example.com
```

The app can probe available routes from gateway settings and prefers LAN when `/health` succeeds.

## Expo Go vs Development Builds

Expo Go is useful for quick UI iteration, but it does not include every native module used by this app.

`react-native-mmkv` requires native code. In Expo Go, the app falls back to in-memory storage, so settings are lost after restart. For persistent storage and native networking behavior, use a development build:

```bash
pnpm exec expo prebuild
pnpm run ios:no-proxy
# or
pnpm run android
```

Run `pnpm exec expo prebuild --clean` after changing `app.json`, config plugins, native permissions, or native networking settings.

## Native Networking Notes

Local gateways often use plain HTTP on a LAN IP, such as `http://192.168.1.44:18790`. Expo Go and installed native builds can behave differently because native builds use this app's own bundle ID, permissions, and network policy.

### Android HTTP Cleartext

Android 9+ blocks HTTP by default. This project enables LAN HTTP through `expo-build-properties` with `android.usesCleartextTraffic: true`.

After changing native network settings:

```bash
pnpm exec expo prebuild --clean
pnpm run android
```

If LAN works in Expo Go but fails in a dev-client or release APK, rebuild the Android app. Cleartext settings are applied at prebuild time.

### iOS Local Network and ATS

The iOS config in `app.json` includes:

- `NSAppTransportSecurity.NSAllowsLocalNetworking`, allowing HTTP to local IPs.
- `NSLocalNetworkUsageDescription`, required for the iOS Local Network privacy prompt.

On first LAN access, iOS asks whether the app may find devices on the local network. Expo Go and the installed xopc app have different bundle IDs, so allowing Expo Go does not grant access to the standalone app.

If LAN is unreachable after install:

1. Open **Settings -> Privacy & Security -> Local Network** and enable **xopc**.
2. Confirm the phone and gateway are on the same Wi-Fi.
3. Open gateway settings in the app and re-detect the route.

## iOS CocoaPods and Proxy Notes

If `expo run:ios` hangs on `Installing CocoaPods...`, system HTTP proxies can slow `pod install` and trigger Node `[UNDICI-EHPA]` warnings.

This repo provides:

- `plugins/with-ios-cocoapods-mirror.js`, which injects a Tsinghua CocoaPods Specs mirror during prebuild.
- Scripts that clear proxy environment variables and prefer Homebrew's `pod`.

Recommended flow:

```bash
pnpm exec expo prebuild
pnpm run pods:install
pnpm run ios:no-install
```

One-step alternative:

```bash
pnpm run ios:no-proxy
```

## Android Release Builds

Release builds use `expo-build-properties` to reduce install size:

- `arm64-v8a` only.
- R8 minification.
- Resource shrinking.

Build a local release APK:

```bash
pnpm exec expo prebuild --clean
pnpm run android:release
```

EAS profiles:

| Script | Output |
|---|---|
| `pnpm run build:android:preview` | Internal Android APK |
| `pnpm run build:android:production` | Android App Bundle |
| `pnpm run build:ios:preview` | Internal iOS build |
| `pnpm run build:ios` | Production iOS build |
| `pnpm run submit:ios` | Submit latest production iOS build |

The current package ID is `ai.xopc.xopc`. If you previously installed a build under `com.anonymous.xopcapp`, uninstall it separately; Android treats it as a different app.

## Quality Checks

Before handing off a change:

```bash
pnpm run lint
pnpm run typecheck
pnpm test
```

If you changed `packages/gateway-sse-client`, also run:

```bash
pnpm run test:gateway-sse-client
```

## License

MIT, matching the xopc main repo unless stated otherwise.
