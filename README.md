# xopc-app

Expo (React Native) mobile client for the [xopc](https://github.com/xopcai/xopc) gateway. Run an xopc gateway (HTTP/WebSocket) with your API keys and optional token auth; configure the app to point at that gateway base URL.

## Layout

- `mobile/` — Expo app (Expo Router).
- `packages/gateway-sse-client/` — shared SSE helpers for agent streaming (`@xopcai/gateway-sse-client`, workspace package).

## Prerequisites

- Node.js 22+
- [pnpm](https://pnpm.io/) 9.x

## Commands

| Script | Description |
|--------|-------------|
| `pnpm run dev:mobile` | Expo dev server |
| `pnpm run mobile:lint` | ESLint (`mobile/`) |
| `pnpm run mobile:typecheck` | TypeScript check (`mobile/`) |
| `pnpm run typecheck` | Mobile + `gateway-sse-client` |
| `pnpm run test:gateway-sse-client` | Vitest for SSE client package |

See [`mobile/README.md`](mobile/README.md) for MMKV / Expo Go notes and gateway setup.

## License

MIT (match xopc main repo unless stated otherwise).
