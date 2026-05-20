# xopc

Standalone Expo (React Native) app for the [xopc](https://github.com/xopcai/xopc) gateway. Run an xopc gateway (HTTP/WebSocket) with your API keys and optional token auth; configure the app to point at that gateway base URL.

**Remote access (FRP):** LAN-first routing and gateway connection UI live on `feat/frp`. Planned **application-layer E2EE** for mobile ↔ gateway traffic is specified in the xopc repo: [docs/mobile-e2ee.md](https://github.com/xopcai/xopc/blob/main/docs/mobile-e2ee.md) (`xopc-e2ee-v1`).

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
| `pnpm run lint` | ESLint |
| `pnpm run typecheck` | TypeScript (app + gateway-sse-client) |
| `pnpm run test:gateway-sse-client` | Vitest for SSE client |

## MMKV and Expo Go

[`react-native-mmkv`](https://github.com/mrousavy/react-native-mmkv) uses native code. **Expo Go** does not ship this module; the app falls back to in-memory storage (settings are lost on restart).

For persistent storage, use a **development build**:

```bash
pnpm exec expo prebuild
pnpm exec expo run:ios
# or: pnpm exec expo run:android
```

## HTTP (cleartext) on Android

Local gateways often use `http://`. This app sets `android.usesCleartextTraffic: true` in `app.json` for development convenience.

## Configure

Open **Settings** in the app: set gateway base URL (no trailing slash) and optional bearer token (must match `gateway` auth in `xopc.json`).

## License

MIT (match xopc main repo unless stated otherwise).
