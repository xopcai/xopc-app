### AI 原生工作空间技术改造 ###
将 XOPC App 从 Notes/Chats 割裂结构改造成 AI-first Workspace：统一 WorkspaceItem、Omnibar、Inbox、Space、Page、Thread、Task，并同步改造 xopc gateway 后端 API。该方案按“不兼容旧 IA/旧数据模型”的方向设计。

# AI 原生工作空间技术改造

将当前移动端从“首页混合最近列表 + Notes/Chats 入口”重构为 AI 原生工作空间。
技术上新增统一 Workspace 域模型，重做移动端 IA、路由、数据查询与后端 API。
旧 Notes/Chats 页面不作为兼容目标，仅复用已成熟的编辑器、会话流、网关连接与附件能力。

## User Review Required

> [!IMPORTANT]
> 本计划默认不做旧数据兼容与迁移。现有 `/api/notes`、`/api/sessions` 可保留给其他端使用，但移动端新 IA 将切到 `/api/workspace/*`、`/api/inbox/*`、`/api/threads/*`。

> [!WARNING]
> 移动端路由、首页、笔记/会话入口会被重做。旧的 `NotesScreen`、`ChatsScreen`、`HomeScreen` 不再作为产品入口维护。

## Proposed Changes

### 后端 Workspace 域模型
新增统一工作空间对象，作为 Page、Thread、Task、Capture、Space、Artifact 的共同索引层。

#### [NEW] [types.ts](file:///Users/michaelxu/develop/github/xopc/src/workspace/types.ts)
定义 `WorkspaceItem`、`WorkspaceItemType`、`WorkspaceStatus`、`Block`、`Thread`、`Capture`、`Task`、`HomeSummary` 等共享类型。

#### [NEW] [store.ts](file:///Users/michaelxu/develop/github/xopc/src/workspace/store.ts)
实现文件型存储，延续当前 `src/notes/store.ts` 的风格：
- `workspace/items/index.json`
- `workspace/items/{id}.json`
- `workspace/blocks/{itemId}.json`
- `workspace/threads/{threadId}.json`
- `workspace/captures/{captureId}.json`
- `workspace/tasks/{taskId}.json`

#### [NEW] [service.ts](file:///Users/michaelxu/develop/github/xopc/src/workspace/service.ts)
封装业务能力：
- 创建 Space / Page / Thread / Task / Capture
- 记录 `lastOpenedAt`
- 生成 Home 数据
- 移动对象到 Space
- Page Blocks 增删改排
- Thread 与 Page/Task 的关联

#### [NEW] [intent-router.ts](file:///Users/michaelxu/develop/github/xopc/src/workspace/intent-router.ts)
实现 Omnibar 的轻量意图路由，第一版先用规则：
- 任务关键词 → `create_task`
- 打开/搜索关键词 → `search`
- 总结/帮我/整理 → `ask_ai` 或 `organize_inbox`
- 默认 → `capture`

---

### 后端 Gateway API
新增移动端专用 API，不强行改旧 notes/session API。

#### [NEW] [workspace.ts](file:///Users/michaelxu/develop/github/xopc/src/gateway/hono/routes/workspace.ts)
提供：
- `GET /api/workspace/home`
- `GET /api/workspace/items`
- `POST /api/workspace/items`
- `GET /api/workspace/items/:id`
- `PATCH /api/workspace/items/:id`
- `DELETE /api/workspace/items/:id`
- `POST /api/workspace/items/:id/open`
- `POST /api/workspace/items/:id/move`
- `GET /api/workspace/items/:id/blocks`
- `POST /api/workspace/items/:id/blocks`
- `PATCH /api/workspace/blocks/:blockId`
- `DELETE /api/workspace/blocks/:blockId`
- `POST /api/workspace/items/:id/blocks/reorder`

#### [NEW] [inbox.ts](file:///Users/michaelxu/develop/github/xopc/src/gateway/hono/routes/inbox.ts)
提供：
- `GET /api/inbox`
- `POST /api/inbox/capture`
- `POST /api/inbox/organize`
- `POST /api/inbox/confirm`
- `POST /api/inbox/archive`

#### [NEW] [threads.ts](file:///Users/michaelxu/develop/github/xopc/src/gateway/hono/routes/threads.ts)
提供：
- `POST /api/threads`
- `GET /api/threads/:id`
- `POST /api/threads/:id/messages`
- `POST /api/threads/:id/context`
- `POST /api/threads/:id/save-output`
- `POST /api/threads/:id/create-task`

#### [NEW] [command.ts](file:///Users/michaelxu/develop/github/xopc/src/gateway/hono/routes/command.ts)
提供：
- `POST /api/command/interpret`
- `POST /api/command/execute`

#### [MODIFY] [app.ts](file:///Users/michaelxu/develop/github/xopc/src/gateway/hono/app.ts)
注册新的 workspace / inbox / threads / command 路由。

#### [MODIFY] [lazy-bundles.ts](file:///Users/michaelxu/develop/github/xopc/src/gateway/hono/routes/lazy-bundles.ts)
如当前 gateway 使用 lazy route bundle，则将 `/api/workspace`、`/api/inbox`、`/api/threads`、`/api/command` 纳入加载范围。

---

### 移动端 API Client
为新 IA 提供 typed client，旧 `query/notes.ts` 与 `query/sessions.ts` 不作为新页面直接依赖。

#### [NEW] [workspace.ts](file:///Users/michaelxu/develop/github/xopc-app/src/query/workspace.ts)
封装 Workspace API：home、items、blocks、open、move。

#### [NEW] [inbox.ts](file:///Users/michaelxu/develop/github/xopc-app/src/query/inbox.ts)
封装 Inbox API：capture、organize、confirm、archive。

#### [NEW] [threads.ts](file:///Users/michaelxu/develop/github/xopc-app/src/query/threads.ts)
封装 Thread API：create、detail、messages、context、save output、create task。

#### [NEW] [command.ts](file:///Users/michaelxu/develop/github/xopc-app/src/query/command.ts)
封装 Omnibar interpret / execute。

#### [MODIFY] [keys.ts](file:///Users/michaelxu/develop/github/xopc-app/src/query/keys.ts)
新增 `workspaceHome`、`workspaceItems`、`inbox`、`thread`、`command` 等 query keys。

---

### 移动端新路由与 IA
替换现有单 Home + Notes/Chats 入口，建立 AI-first 路由结构。

#### [MODIFY] [_layout.tsx](file:///Users/michaelxu/develop/github/xopc-app/app/_layout.tsx)
注册新页面：`command`、`inbox`、`spaces`、`items`、`threads`，移除旧 notes 作为主产品入口。

#### [MODIFY] [_layout.tsx](file:///Users/michaelxu/develop/github/xopc-app/app/(tabs)/_layout.tsx)
保持无底部 Tab 的单入口布局，但默认进入新的 Workspace Home。

#### [MODIFY] [index.tsx](file:///Users/michaelxu/develop/github/xopc-app/app/(tabs)/index.tsx)
切换为新 `WorkspaceHomeScreen`。

#### [NEW] [command.tsx](file:///Users/michaelxu/develop/github/xopc-app/app/command.tsx)
全局命令页：搜索、捕获、Ask AI、创建任务、打开对象。

#### [NEW] [index.tsx](file:///Users/michaelxu/develop/github/xopc-app/app/inbox/index.tsx)
Inbox 页面入口。

#### [NEW] [[id].tsx](file:///Users/michaelxu/develop/github/xopc-app/app/spaces/[id].tsx)
Space 详情页。

#### [NEW] [[id].tsx](file:///Users/michaelxu/develop/github/xopc-app/app/items/[id].tsx)
WorkspaceItem 详情页，按类型分发 Page / Capture / Task / Artifact。

#### [NEW] [[id].tsx](file:///Users/michaelxu/develop/github/xopc-app/app/threads/[id].tsx)
Thread 工作会话页。

---

### 移动端 Workspace UI 模块
首页保留 5 个核心模块：Omnibar、Continue、Today、Inbox、Spaces。

#### [NEW] [WorkspaceHomeScreen.tsx](file:///Users/michaelxu/develop/github/xopc-app/src/features/workspace/WorkspaceHomeScreen.tsx)
新首页容器，负责拉取 `GET /api/workspace/home` 并组合模块。

#### [NEW] [Omnibar.tsx](file:///Users/michaelxu/develop/github/xopc-app/src/features/workspace/Omnibar.tsx)
首页中央输入入口，支持跳转 `command`，也支持轻量快速捕获。

#### [NEW] [ContinueRail.tsx](file:///Users/michaelxu/develop/github/xopc-app/src/features/workspace/ContinueRail.tsx)
横滑展示最近继续项。

#### [NEW] [TodayBrief.tsx](file:///Users/michaelxu/develop/github/xopc-app/src/features/workspace/TodayBrief.tsx)
展示待整理、待确认、待推进摘要。

#### [NEW] [InboxPreview.tsx](file:///Users/michaelxu/develop/github/xopc-app/src/features/workspace/InboxPreview.tsx)
首页 Inbox 预览。

#### [NEW] [SpaceList.tsx](file:///Users/michaelxu/develop/github/xopc-app/src/features/workspace/SpaceList.tsx)
展示 Space 列表与展开入口。

#### [NEW] [BottomCommandBar.tsx](file:///Users/michaelxu/develop/github/xopc-app/src/features/workspace/BottomCommandBar.tsx)
固定底部 `[搜索] [万事问 AI] [新建]`。

---

### Inbox、Page、Thread、Command 功能页
复用现有编辑器和会话流，但产品语义切换为 Workspace。

#### [NEW] [InboxScreen.tsx](file:///Users/michaelxu/develop/github/xopc-app/src/features/inbox/InboxScreen.tsx)
未处理 Capture 列表、滑动归档、AI 整理入口。

#### [NEW] [AiOrganizeSheet.tsx](file:///Users/michaelxu/develop/github/xopc-app/src/features/inbox/AiOrganizeSheet.tsx)
展示 AI 整理建议与确认动作。

#### [NEW] [PageScreen.tsx](file:///Users/michaelxu/develop/github/xopc-app/src/features/page/PageScreen.tsx)
Page 详情页，复用 `NoteBlockEditor` 能力但对接 Workspace Blocks。

#### [NEW] [PageAiActions.tsx](file:///Users/michaelxu/develop/github/xopc-app/src/features/page/PageAiActions.tsx)
页面 AI 操作：总结、继续写、提取任务、发起 Thread。

#### [NEW] [ThreadScreen.tsx](file:///Users/michaelxu/develop/github/xopc-app/src/features/thread/ThreadScreen.tsx)
AI 工作会话页，复用现有聊天消息组件与流式逻辑。

#### [NEW] [ThreadOutputs.tsx](file:///Users/michaelxu/develop/github/xopc-app/src/features/thread/ThreadOutputs.tsx)
展示可保存到 Page / 转 Task 的输出。

#### [NEW] [CommandScreen.tsx](file:///Users/michaelxu/develop/github/xopc-app/src/features/command/CommandScreen.tsx)
全局命令中心。

---

### 本地优先与同步
第一阶段先沿用 MMKV queue，后续再切 SQLite；避免一次性引入过大 Native 风险。

#### [NEW] [workspace-sync.ts](file:///Users/michaelxu/develop/github/xopc-app/src/sync/workspace-sync.ts)
基于现有 `offline-queue.ts` 实现 capture、block edit、task update 的本地队列。

#### [MODIFY] [offline-queue.ts](file:///Users/michaelxu/develop/github/xopc-app/src/sync/offline-queue.ts)
补充 dead-letter 查询能力和错误原因记录，便于 Inbox Review 显示。

---

### 测试与验证
覆盖模型、API、Intent Router、移动端 query client 和关键 UI 行为。

#### [NEW] [service.test.ts](file:///Users/michaelxu/develop/github/xopc/src/workspace/__tests__/service.test.ts)
验证 workspace item、home summary、move、open、capture、task。

#### [NEW] [intent-router.test.ts](file:///Users/michaelxu/develop/github/xopc/src/workspace/__tests__/intent-router.test.ts)
验证 Omnibar 规则路由。

#### [NEW] [workspace-routes.test.ts](file:///Users/michaelxu/develop/github/xopc/src/gateway/__tests__/workspace-routes.test.ts)
验证 gateway API。

#### [NEW] [workspace.test.ts](file:///Users/michaelxu/develop/github/xopc-app/src/query/__tests__/workspace.test.ts)
验证移动端 API client。

#### [NEW] [inbox.test.ts](file:///Users/michaelxu/develop/github/xopc-app/src/query/__tests__/inbox.test.ts)
验证 Inbox client。

## Verification Plan

### Automated Tests

- 后端：`cd /Users/michaelxu/develop/github/xopc && pnpm run typecheck`
- 后端：`cd /Users/michaelxu/develop/github/xopc && pnpm test -- workspace intent gateway`
- 移动端：`cd /Users/michaelxu/develop/github/xopc-app && pnpm run typecheck`
- 移动端：`cd /Users/michaelxu/develop/github/xopc-app && pnpm run lint`
- 移动端：`cd /Users/michaelxu/develop/github/xopc-app && pnpm test`

### Manual Verification

- 启动 gateway 后，打开 App 能看到新 Home。
- Omnibar 输入普通文本会进入 Inbox Capture。
- Omnibar 输入任务语义会创建 Task。
- Inbox 可 AI 整理并确认。
- Page 可编辑 Blocks 并保存。
- Page 可发起 Thread，Thread 输出可保存回 Page 或转 Task。
- 离线时 Capture 可立即出现在 Inbox，恢复网络后同步。

updateAtTime: 2026/6/11 09:51:34

planId: b4515765-b298-490a-aaa0-2f4913b02597