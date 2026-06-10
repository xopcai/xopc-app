# AGENTS.md — xopc-app

面向 AI 编码助手与协作者的项目规范。人类可读概览见 [README.md](./README.md)；视觉与组件样式见 [DESIGN.md](./DESIGN.md)（色阶与 [xopc 桌面端 DESIGN.md](https://github.com/xopcai/xopc/blob/main/DESIGN.md) 对齐）。

---

## Expo 文档锚点

**在编写或修改 Expo / React Native 相关代码前**，先查阅与本项目 SDK 对齐的版本文档：

- Expo SDK **56**：<https://docs.expo.dev/versions/v56.0.0/>
- Expo Router：<https://docs.expo.dev/router/introduction/>
- AI 助手与 Expo：<https://docs.expo.dev/agents/>
- 可选：Expo MCP Server、Expo Skills（SDK 升级、EAS、原生 UI 等）

验证 agent 是否读取项目上下文：打开 `package.json`，确认 Expo SDK 版本与上述文档一致。

---

## 项目概览

xopc-app 是 [xopc](https://github.com/xopcai/xopc) gateway 的 **Expo 移动客户端**：笔记、收件 triage、AI 会话、自动化任务。通过 HTTP/WebSocket 连接用户自托管 gateway；支持 LAN 优先路由与 FRP 远程访问（QR 配对）。

**气质**：Calm Intelligence — 克制、以内容为中心；详见 DESIGN.md。

---

## 技术栈

| 层 | 选型 |
|----|------|
| 运行时 | Expo ~56、React Native 0.85、React 19 |
| 路由 | expo-router（`app/` 文件路由） |
| 服务端状态 | @tanstack/react-query |
| 客户端状态 | zustand（`src/stores/`） |
| 持久化 | react-native-mmkv（`src/storage/mmkv.ts`）；Web 回退 localStorage |
| UI | react-native-paper + 自研主题（`src/theme/`：`tokens.ts`、`paper-theme.ts`、`useTheme`） |
| 手势 / 动画 | react-native-gesture-handler、react-native-reanimated |
| 键盘 | react-native-keyboard-controller（`KeyboardStickyView` 等） |
| 列表性能 | @shopify/flash-list（长列表，如 Chat） |
| 校验 | zod、react-hook-form |
| 测试 | vitest（`pnpm test`） |
| 工作区包 | `packages/gateway-sse-client`（`@xopcai/gateway-sse-client`） |

### 禁止替换 / 混用（NEVER）

- **导航**：不要引入 react-navigation 独立配置或其它路由库 — 使用 expo-router。
- **数据拉取**：不要用 `useEffect` + `fetch` 拉服务端数据 — 使用 React Query（`src/query/`）。
- **列表手势**：不要为列表再写第三套左滑组件 — 使用 `SwipeableRow`。
- **列表长按**：不要长按弹出 Action Sheet / Dropdown Menu 承载左滑已有操作 — 长按统一进多选。
- **触控**：优先 `Pressable`，避免 `TouchableOpacity`。
- **样式**：不要硬编码色值、间距、圆角 — 使用 `useTheme()` 与 `src/theme/tokens.ts`；勿用 `#E5E5EA`、`#007AFF` 等旧色替代 token。
- **Paper 主题**：不要直接使用 `MD3LightTheme` / `MD3DarkTheme` 默认值 — 根布局经 `createPaperTheme()`（`src/theme/paper-theme.ts`）映射 token。
- **文案**：不要硬编码面向用户的字符串 — 使用 `useMessages()` 与 `src/i18n/locales/`。
- **原生配置**：不要手写 `android/` / `ios/` 补丁替代 config plugin — 自定义插件在 `plugins/`，改后需 `expo prebuild`。
- **Git**：仅在用户明确要求时 commit / 开 PR。

---

## 环境与命令

**前置**：Node.js 22+、pnpm 9.x。

```bash
pnpm install
pnpm start                    # Expo dev server
pnpm run android / ios / web
pnpm run lint
pnpm run typecheck            # app + gateway-sse-client
pnpm test                     # vitest
pnpm run test:gateway-sse-client
```

**持久化存储（MMKV）**：Expo Go **不包含** MMKV 原生模块，会回退内存存储。需要持久化请用 development build：

```bash
pnpm exec expo prebuild
pnpm run ios:no-proxy         # 或 android；见 README 代理 / CocoaPods 说明
```

**改 `app.json` 插件或原生网络设置后**：`expo prebuild --clean` 并重新构建对应平台。

---

## 目录结构

```
app/                    # Expo Router 路由（薄层，导出 feature Screen）
src/
  features/             # 按功能域划分（chat, notes, inbox, gateway, sessions…）
  components/           # 跨 feature 共享 UI（SwipeableRow, BatchActionBar…）
  hooks/                # 跨 feature hooks
  query/                # React Query keys、fetchers、cache 工具
  stores/               # zustand
  storage/              # MMKV / Web storage 抽象
  theme/                # tokens、useTheme、paper-theme、浮动底栏 layout 常量
  i18n/                 # en / zh MessageBundle
  motion/               # haptics、动画 token
  api/                  # gateway HTTP 客户端
  sync/                 # 离线队列
packages/
  gateway-sse-client/   # SSE 解析工作区包
plugins/                # Expo config plugins（Maven / CocoaPods 镜像等）
```

**约定**：

- 新功能优先放在 `src/features/<domain>/`，路由文件只做 re-export 或极简包装。
- 平台差异用 `*.native.tsx` / `*.web.tsx` 后缀（已有：编辑器、Automation、WorkspacePager）。
- 路径别名：`@/*` → `src/*`（`tsconfig.json`）。

---

## 开发约定

### UI 与设计系统

- 色值、字号、间距、圆角、阴影：遵循 [DESIGN.md](./DESIGN.md)，通过 `useTheme()` 消费；与 xopc Gateway 共用同一套灰阶与 `#2563EB` 品牌蓝（light）/ `#3B82F6`（dark）。
- **主题架构**：`tokens.ts` 为唯一色值来源 → `useTheme()` / `getColors()` 供业务组件 → `createPaperTheme()` 同步 react-native-paper（`app/_layout.tsx` 的 `PaperProvider`）。
- 浮动面板边框：light 用 `colors.border.default`（`#D2D2D7`），勿用更淡的 `rgba(15,23,42,0.10)`。
- 触控目标最小 **44×44**。
- 浮动底栏：`FLOATING_BOTTOM_OFFSET`、`floatingBottomPadding`（`src/theme/layout`）。
- Safe area：`react-native-safe-area-context`。

### 国际化

```tsx
import { useMessages, t } from '../i18n/messages';
const m = useMessages();
<Text>{m.sessions.empty}</Text>
<Text>{t(m.batch.selectedCount, { count: n })}</Text>
```

新增用户可见文案须同时更新 `src/i18n/locales/en.ts` 与 `zh.ts`。

### 数据层

- Query keys 集中在 `src/query/keys.ts`；invalidate 时优先用已有 key 工厂函数。
- Gateway 连接、SSE、路由探测：`src/features/gateway/`。
- 笔记本地合并 / 同步：`src/features/notes/notes-local.ts`、`notes-sync`。

### 导航

- 首页路由：`app/(home)/` — 原 `(tabs)` 已重命名为 `(home)`。
- Note 列表项单击统一 `router.push('/items/:id')`。
- Chat 路由：`/chat/[k]`（k = session key，可选 msg 参数为 prefill 消息）。
- 废弃路由已移除：`/notes/[id]` 重定向、`/spaces/[id]`、`/chat/index` — 不再存在。
- 深链与 gateway 配对：`src/features/gateway/apply-gateway-deeplink`。

### 列表性能

- 长列表、高频更新（如 Chat）：`FlashList`，memo 列表项，稳定 `keyExtractor` / callback。
- 中等列表可用 `FlatList`；左滑行用 `SwipeableRow`，多选时 `enabled={false}`。

### 键盘

- 输入贴底场景使用 `react-native-keyboard-controller` 的 `KeyboardStickyView`，勿与系统键盘避让逻辑打架。

### 测试

- 纯逻辑放 `__tests__/` 旁文件，vitest 运行；优先测解析、缓存、路由策略等可单元化逻辑。
- 改 `packages/gateway-sse-client` 时跑 `pnpm run test:gateway-sse-client`。

---

## 列表交互契约（全局强制）

所有可滚动列表（Notes、Inbox、Sessions 等）必须遵循同一套手势语义。**禁止**同一实体（如 `NoteIndexEntry`）在不同入口使用不同长按/滑动行为。

### 手势语义

| 手势 | 全局语义 | 说明 |
|------|----------|------|
| **单击** | 打开 / 导航 | 列表项第一优先级 |
| **左滑** | 快捷单条操作 | 高频、可逆在前；删除在最后 |
| **长按** | 进入多选模式 | 全 App 统一；**禁止**长按直接弹 Action Sheet |
| **多选中单击** | 切换选中 | 标准邮件/相册多选 |
| **返回 / 取消** | 退出多选 | Header：`已选择 N 项`，左侧「取消」 |

### 操作分层

```
第一层：左滑           → 最高频、单条、秒级完成
第二层：多选批量栏     → 多条、同类操作
第三层：详情页「更多」 → 低频、复杂（分享、同步、AI 等）
```

**禁止**用「长按菜单」承载左滑已能完成的操作。

### 时间与反馈

- `delayLongPress`：**300ms** — 使用 `LIST_DELAY_LONG_PRESS`（`src/constants/list-interaction.ts`）
- 进入多选：轻 haptic（`impactLight`，见 `src/motion/haptics.ts`）
- 单条删除：Snackbar + **撤销**（`LIST_DELETE_UNDO_MS` ≈ 5s；`use-note-delete-with-undo`）
- 批量删除：确认 Dialog（`BatchDeleteConfirmDialog`）
- 归档：直接执行 + 轻提示（可不做 Undo）

### 多选模式 UI

| 元素 | 规范 |
|------|------|
| Header 标题 | 正常：页面名；多选：`已选择 N 项` |
| Header 左侧 | 多选时「取消」 |
| Header 右侧 | 正常态「选择」文字按钮 |
| 列表项左侧 | 多选 checkbox（`ListSelectionCheckbox`）；正常时类型图标 |
| 底部 | `BatchActionBar`（多选时**替换** composer / 底栏） |
| 左滑 | 多选模式下 **禁用** |

### 左滑发现性

- 空状态或首次进入弱提示（`SwipeHintBanner`）；或 `hasSeenSwipeHint` coach mark。
- 文案全局统一：「左滑可快速归档」等，不按页面各写一套。

### 共享 primitive（优先复用）

| 组件 / Hook | 路径 | 职责 |
|-------------|------|------|
| `SwipeableRow` | `src/components/SwipeableRow.tsx` | 左滑圆形按钮、阈值、互斥关闭 |
| `swipe-open-registry` | `src/components/swipe-open-registry.ts` | 同时只展开一行 |
| `useListSelection` | `src/hooks/use-list-selection.ts` | 多选状态 |
| `ListSelectionCheckbox` | `src/components/ListSelectionCheckbox.tsx` | 多选勾选 |
| `BatchActionBar` | `src/components/BatchActionBar.tsx` | 底部批量操作 |
| `BatchDeleteConfirmDialog` | `src/components/BatchDeleteConfirmDialog.tsx` | 批量删除确认 |
| `SwipeHintBanner` | `src/components/SwipeHintBanner.tsx` | 左滑引导 |

左滑按钮：圆形 **44×44**；颜色语义 — 绿=置顶、蓝=归档、红=删除（与 `SwipeableRow` `ACTION_COLOR_MAP` 一致）。

```ts
type SwipeAction = {
  key: string;
  icon: string;
  color: 'green' | 'blue' | 'red';
  label: string;
  destructive?: boolean;
};
// inbox:    [archive, delete]
// notes:    [pin|unpin, archive, delete]
// sessions: [archive, delete]
```

---

## 各页面动作配置

### /inbox

| 渠道 | 操作 |
|------|------|
| 左滑 | 归档 · 删除 |
| 多选批量栏 | 归档 · 删除 ·（后续）打标签 |
| 详情「更多」 | AI 整理、分享等 |

参考：`InboxScreen.tsx`、`InboxSwipeableItem.tsx`

### /notes

| 渠道 | 操作 |
|------|------|
| 左滑 | 置顶/取消置顶 · 归档 · 删除 |
| 多选批量栏 | 置顶 · 取消置顶 · 归档 · 删除 · **打标签** |
| 详情「更多」 | 分享、同步、创建任务等 |

参考：`NotesScreen.tsx`、`SwipeableNoteCard.tsx`、`NoteCard.tsx`

### /sessions

| 渠道 | 操作 |
|------|------|
| 左滑 | 归档 · 删除 |
| 多选批量栏 | 归档 · 删除 · 置顶 · 重命名 |
| 单条特殊 | **重命名** 放多选栏或详情，不进左滑 |

参考：`SessionCard.tsx`、`SessionsScreen.tsx`、`SwipeableRow.tsx`  
**已迁移**：长按 Dropdown → 多选（`onLongPress` + haptic）；左滑 `SwipeableRow`（archive + delete）；`SessionActionPopover` 已清理。

### /automation（低优先级）

列表项可保持内嵌按钮（开关、立即运行）。列表变长后再补左滑删除 / 长按多选。

---

## 反模式（禁止）

- ❌ 同一 `NoteIndexEntry` 在 `/inbox` 长按多选、在 `/notes` 长按弹 Action Sheet
- ❌ 长按弹出与左滑重复的底部 Sheet
- ❌ 多选模式下仍允许左滑
- ❌ 各页面不同的 `delayLongPress`（280 / 350 / 400 混用）
- ❌ 单条删除无撤销、批量删除无确认
- ❌ 新建第三套滑动组件
- ❌ 列表项单击走不同路由（Notes 应直达 `/items/:id`）
- ❌ 在组件内硬编码中文/英文用户文案
- ❌ 在 `useEffect` 里拉 gateway API 而不经 React Query

---

## 迁移优先级与验收

| 阶段 | 内容 |
|------|------|
| **P0** | Notes 长按改为多选；移除 Action Sheet；统一单击路由 |
| **P1** | 全面采用 `SwipeableRow`；Notes 批量栏（含打标签） |
| **P2 ✅** | Sessions 左滑 + 多选；废弃 Menu / `SessionActionPopover` — **已完成** |
| **P3** | 删除 Undo、确认 Dialog、左滑引导（共享组件已就绪，逐页接入） |

**验收清单**（改列表交互后自测）：

1. `/inbox` 与 `/notes` 长按同一条 note，行为一致（多选、checkbox、底部批量栏）。
2. `/notes` 左滑可置顶/归档/删除；长按**不再**弹底部菜单。
3. 多选时左滑不可用；单击切换选中；取消退出多选。
4. Sessions 长按进多选，左滑归档/删除，与 Notes 手势一致。
5. 所有列表 `delayLongPress` 为 300ms，长按有 haptic。
6. 单条删除可撤销；批量删除有确认 Dialog。

---

## 范围外（勿擅自扩展）

- 不要重构未触及的 feature 或「顺便」改样式。
- 不要升级 Expo SDK / 主要依赖，除非任务明确要求。
- 不要修改 gateway 服务端或 xopc 桌面端代码。
- 不要向仓库提交密钥、`.env`、配对 token。

---

## Claude Code 用户

若使用 Claude Code，可在项目根添加 `CLAUDE.md`（内容仅为 `@AGENTS.md`），与 [Expo 官方指引](https://docs.expo.dev/agents/) 一致，避免双份规则分叉。
