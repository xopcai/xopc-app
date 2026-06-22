# Repository Guidelines

## Project Overview

`xopc-app` is the Expo mobile client for the xopc gateway. It connects to a user-hosted gateway over HTTP/WebSocket, supports LAN-first routing, and pairs with FRP by QR code. Before changing Expo or React Native code, confirm Expo `~56` in `package.json` and use the SDK 56 docs.

## Project Structure & Module Organization

- `app/` contains Expo Router routes. Keep files thin and delegate to feature screens.
- `src/features/` contains domains such as `chat`, `notes`, `inbox`, `gateway`, and `sessions`.
- `src/components/`, `src/hooks/`, `src/query/`, `src/stores/`, `src/storage/`, `src/theme/`, `src/i18n/`, `src/api/`, and `src/sync/` contain shared UI, data, state, persistence, tokens, messages, clients, and sync logic.
- `packages/gateway-sse-client/` is the workspace SSE parser.
- `plugins/` contains Expo config plugins; prefer plugins over generated `android/` or `ios/` patches.

Use `@/*` for `src/*` imports and `*.native.tsx` / `*.web.tsx` for platform splits.

## Build, Test, and Development Commands

Use Node.js 22+ and pnpm 9.x.

- `pnpm install`: install dependencies.
- `pnpm start`: start Expo.
- `pnpm run android`, `pnpm run ios`, `pnpm run web`: run targets.
- `pnpm run lint`: run ESLint.
- `pnpm run typecheck`: check the app and SSE package.
- `pnpm test`: run Vitest.
- `pnpm run test:gateway-sse-client`: test the SSE package.

For persistent MMKV storage, use a development build: `pnpm exec expo prebuild`, then `pnpm run ios:no-proxy` or Android.

## Coding Style & Architecture Rules

Use TypeScript, React 19, React Native 0.85, Expo Router, React Query, zustand, and react-native-paper. Do not add separate navigation stacks, alternate fetch patterns, or duplicate gesture primitives.

Server data must go through React Query and `src/query/`; do not fetch gateway data from `useEffect`. User text must use `useMessages()` and `src/i18n/locales/`. Do not hardcode visual values; use `useTheme()` and `src/theme/tokens.ts`. Prefer `Pressable`.

## UI & List Interaction Rules

Follow `DESIGN.md`: calm, content-first, restrained, token-driven UI. Minimum touch targets are 44x44.

All scrollable lists share this contract: tap opens, swipe left uses `SwipeableRow`, long press enters multi-select with `LIST_DELAY_LONG_PRESS` (300 ms), and multi-select disables swiping. Reuse `useListSelection`, `ListSelectionCheckbox`, and `BatchActionBar`. Single delete needs undo; batch delete needs `BatchDeleteConfirmDialog`. Notes open at `/items/:id`; chat uses `/chat/[k]`.

## Testing Guidelines

Use Vitest for parsing, cache behavior, sync, route strategy, and other pure logic. Place tests near code in `__tests__/`, for example `notes-local.test.ts`. Run SSE tests when touching `packages/gateway-sse-client/`.

## Commit & Pull Request Guidelines

Recent history uses concise Conventional Commit-style subjects such as `feat(page): ...`, `feat: ...`, and `chore: ...`. Keep commits scoped. Do not commit or open PRs unless asked. PRs should include summary, tests, linked issues, and UI screenshots.

## Security & Configuration

Do not commit secrets, `.env` files, gateway tokens, pairing tokens, or API keys. Do not upgrade Expo SDK or major dependencies unless requested. After changing `app.json`, native network settings, or config plugins, run `expo prebuild --clean` and rebuild.
