# xopc-app · Mobile Design Language

## 1. Visual theme & atmosphere

xopc-app 是 xopc 的 **React Native 移动客户端**：AI 原生工作空间，集笔记、任务、AI 对话于一体。界面气质与桌面端一脉相承——**克制、清晰、以内容为中心**，但针对移动端的单手操作、小屏密度、触控交互做了专属适配。

**核心取向**：拇指可达的关键操作，一眼可辨的信息层级，零装饰噪音。

**品牌气质：Calm Intelligence（沉静智能）**

- 内容是主角，Chrome 是背景；AI 在需要时准确出现，不需要时不抢戏。
- **优雅、智能、克制** —— 少即是多。

**视觉原则**

- **中性色占绝对主导**：约 95% 面积由灰阶构成，大面积 `#F5F5F7`（浅）/ `#000000`（深）底色。
- **紫色强调（`#6D5DFB`）**：AI 相关入口与操作的唯一彩色信号；系统蓝（`#007AFF`）用于链接与系统级交互。
- **阴影克制**：层级主要靠 **表面色阶 + 细边框**；阴影仅用于浮动元素（底栏、弹层）。
- **圆角偏大、有机**：移动端圆角比桌面端更大（卡片 `24px`、按钮 `22px`），营造亲和的触感。

---

## 2. Color palette & roles

所有色值定义在 `src/theme/tokens.ts`，通过 `useTheme()` hook 消费。**禁止在组件中硬编码色值**，除非是与 tokens 对齐的 `rgba()` 透明度变体。

### 2.1 表面与层级

| 语义 | Light | Dark | 用途 |
|------|-------|------|------|
| `surface.base` | `#F5F5F7` | `#000000` | 全局底层、页面背景 |
| `surface.panel` | `#FFFFFF` | `#1C1C1E` | 卡片、浮起的面板 |
| `surface.input` | `#F5F5F7` | `#2C2C2E` | 输入框底色 |
| `surface.hover` | `#E8E8ED` | `#3A3A3C` | 按压反馈（移动端少用） |
| `surface.active` | `#DCDCDE` | `#48484A` | 强选中背景 |

### 2.2 文本色阶

| 层级 | Light | Dark | 用途 |
|------|-------|------|------|
| `text.primary` | `#1C1C1E` | `#F5F5F7` | 标题、正文 |
| `text.secondary` | `#6E6E73` | `#A1A1A6` | 次要说明、图标默认色 |
| `text.tertiary` | `#8E8E93` | `#8E8E93` | placeholder、元信息 |
| `text.disabled` | `#AEAEB2` | `#636366` | 不可用状态 |
| `text.inverse` | `#FFFFFF` | `#000000` | 深色按钮上的文字 |

### 2.3 边框

| 层级 | Light | Dark | 用途 |
|------|-------|------|------|
| `border.subtle` | `#EBEBED` | `#2C2C2E` | 列表内分割 |
| `border.default` | `#E5E5EA` | `#38383A` | 卡片、输入框 |
| `border.strong` | `#D2D2D7` | `#48484A` | 需强调的容器 |

### 2.4 交互与强调色

- **系统蓝（accent）**：`#007AFF`（浅）/ `#0A84FF`（深），用于链接、系统级选中。
- **AI 紫**：`#6D5DFB`，用于 AI 入口图标、AI 相关状态指示。全局紫色点位 **不超过两三处**。
- **选中高亮**：`rgba(0,122,255,0.10)`（浅）/ `rgba(0,122,255,0.18)`（深）。

### 2.5 语义色（状态）

仅用于状态反馈，不作装饰：

| 语义 | Light | Dark |
|------|-------|------|
| 成功 | `#16A34A` | `#86EFAC` |
| 警告 | `#D97706` | `#FCD34D` |
| 错误 | `#DC2626` | `#FCA5A5` |
| 信息 | `#2563EB` | `#93C5FD` |

### 2.6 浮动元素的背景处理

底栏、输入框等浮动在页面上方的元素：

- **Light**：白底 `#FFFFFF` + `borderWidth: 1` + `borderColor: rgba(15,23,42,0.10)` + 轻阴影
- **Dark**：`rgba(255,255,255,0.12)` + `borderColor: rgba(255,255,255,0.10)` + 轻阴影
- 阴影统一：`shadowOpacity: 0.06`、`shadowRadius: 4`、`elevation: 2`

---

## 3. Typography

### 3.1 字体栈

系统无衬线栈，不额外引入字体：
- **iOS**：SF Pro Text / SF Pro Display
- **Android**：Roboto

### 3.2 字号层级

定义在 `tokens.typography`，通过解构使用。

| 层级 | fontSize | lineHeight | fontWeight | 场景 |
|------|----------|------------|------------|------|
| `display` | 30 | 36 | `600` | 欢迎页、空状态大标题 |
| `title` | 20 | 28 | `600` | 页面标题、模态标题 |
| `heading` | 17 | 24 | `600` | 区块标题、卡片标题（今日简报等） |
| `body` | 15 | 22 | `400` | 正文、主 UI 文本 |
| `ui` | 14 | 20 | `500` | 按钮、输入框、列表项 |
| `label` | 13 | 18 | `400` | 次要标签 |
| `caption` | 12 | 17 | `400` | 时间戳、元信息 |
| `micro` | 11 | 14 | `500` | 小徽标、极小标注 |

### 3.3 字重使用

- `400`：正文与说明
- `500`：UI 控件、底栏 placeholder
- `600`：页面标题、卡片标题
- `800`：关键指标数字（今日简报数字）、强标题
- `900`：指标数字的极端强调（慎用）

### 3.4 排版原则

- **层级靠字阶与字重，不靠随意调色**
- **内容左对齐**为主；指标数字可居中
- **标题行高偏紧、正文行高偏松**

---

## 4. Layout & spacing

### 4.1 间距刻度（8pt grid）

定义在 `tokens.spacing`：

| Token | 值 | 用途 |
|-------|----|------|
| `xxs` | 2px | 微调 |
| `xs` | 4px | 图标与文字间隙 |
| `sm` | 8px | 元素内紧凑间距、gap |
| `md` | 12px | 列表行内边距、组件间 |
| `lg` | 16px | 页面水平边距 `paddingHorizontal` |
| `xl` | 24px | 区块间距 |
| `xxl` | 32px | 页面级模块间 |
| `xxxl` | 48px | 大留白、空状态 |

### 4.2 页面结构

```
┌─────────────────────────┐
│  Status Bar (系统)       │
│  Safe Area Top           │
├─────────────────────────┤
│  Header / Appbar         │  44-56px
├─────────────────────────┤
│                          │
│  Scrollable Content      │  flex: 1
│  paddingHorizontal: 16   │
│                          │
├─────────────────────────┤
│  Bottom Bar (浮动)       │  44px + safe area
│  position: absolute      │
│  left: 0, right: 0       │
│  paddingHorizontal: 14   │
└─────────────────────────┘
```

### 4.3 页面边距

- **水平边距**：`paddingHorizontal: 16`（ScrollView 内容区）
- **底栏水平边距**：`paddingHorizontal: 14`（略窄于内容区，视觉上不顶边）
- **列表内容底部留白**：`paddingBottom: insets.bottom + 80`（为底部浮动栏留空间）

### 4.4 留白哲学

- **组件内偏紧、模块间偏松**：卡片内 `padding: 16`，卡片之间 `gap: 16`
- **首页模块间**：`gap: 16` 在 ScrollView 内
- **空状态**：`paddingTop: 110` + `paddingHorizontal: 36`，居中呈现

---

## 5. Shape & border radius

定义在 `tokens.radii`：

| Token | 值 | 用途 |
|-------|----|------|
| `sm` | 6px | 小标签、小徽标 |
| `md` | 10px | Chip、列表行 |
| `lg` | 14px | 一般卡片 |
| `xl` | 18px | 面板、较大卡片 |
| `xxl` | 22px | 按钮、输入框、底栏元素 |
| `full` | 9999px | 头像、分段控件轨道 |

### 关键组件圆角

| 组件 | 圆角 | 说明 |
|------|------|------|
| 今日简报卡片 | `24px` | 大圆角，亲和感 |
| 列表项卡片 | `20px` | 中大圆角 |
| 底栏按钮 | `22px`（pill） | 圆形 |
| 底栏 AI 输入 | `22px`（pill） | 胶囊 |
| Inbox 输入框 | `22px`（pill） | 与底栏一致 |
| Chip 过滤器 | `md`（10px） | 紧凑 |

---

## 6. Depth & elevation

| 级别 | 处理 | 用途 |
|------|------|------|
| 平面 0 | 无影，仅靠背景色 | 页面底层、静态区 |
| 轻抬升 | `shadowOpacity: 0.06` / `elevation: 2` | 底栏按钮、浮动输入框 |
| 中抬升 | `shadowOpacity: 0.10` / `elevation: 4` | 底部 Sheet |
| 浮层 | `shadowOpacity: 0.15` / `elevation: 8` | 模态、ActionSheet |

**阴影参数统一**：

```typescript
// 轻抬升
shadowColor: '#000',
shadowOpacity: 0.06,
shadowRadius: 4,
shadowOffset: { width: 0, height: 2 },
elevation: 2,
```

**原则**：深色模式阴影进一步减弱，**边线**更重要。大多数层级靠 **表面色差 + 1px 边框**。

---

## 7. Components

### 7.1 底部操作栏（BottomCommandBar）

首页核心入口，参考 Notion 移动端设计：

- **三个独立元素**，不包在一个 bar 里
- 左🔍搜索：圆形按钮 `44×44`，直达笔记搜索
- 中✨问 AI：胶囊 pill `flex: 1 × 44`，直达 AI 对话（创建 session → `/chat/:key`）
- 右📝新建：圆形按钮 `44×44`，直达创建空白笔记
- 浮动在内容上方，`position: absolute`，底部 `paddingBottom: max(insets.bottom, 12)`
- 每个元素有独立的背景色、1px 边框、轻阴影

```
[ 🔍 ]  [ ✨ 问 AI ........................ ]  [ 📝 ]
```

### 7.2 今日简报（TodayBrief）

- 卡片圆角 `24px`，1px 边框
- 浅蓝底（Light `#EEF4FF`）/ 深蓝底（Dark `#151B2B`）
- 顶部：紫色圆形图标 + 标题"今日简报" + 副标题
- 下方：两个指标卡片（待整理/待办任务），**可点击**跳转对应页面
- 指标数字：`fontSize: 20, fontWeight: 900`
- 指标标签：`fontSize: 11, fontWeight: 700`

### 7.3 卡片与列表项

- 列表项卡片：`borderWidth: 1`、`borderRadius: 20`、`padding: 14`
- 布局：左图标（36×36 圆形色底）+ 中文本（标题 + 摘要）+ 右操作按钮
- 标题：`fontSize: 15, fontWeight: 800`
- 摘要：`fontSize: 12, fontWeight: 600`

### 7.4 浮动输入栏（Inbox 等）

与底部操作栏一致的浮动风格：
- `position: absolute`，贴底，respects safe area
- 胶囊输入框 `borderRadius: 22`，1px 边框，轻阴影
- 发送按钮：紫色圆形 `44×44`，白色图标

### 7.5 Appbar / Header

- 使用 react-native-paper `Appbar.Header`
- `mode="center-aligned"`，标题居中
- 背景色 = `surface.base`，无 elevation
- 返回按钮使用 `Appbar.BackAction`

### 7.6 空状态

- 居中布局：`alignItems: center`，`paddingTop: 110`
- 图标 `42-48px`，`text.tertiary` 色
- 标题：`fontSize: 18, fontWeight: 800`
- 说明：`fontSize: 13, textAlign: center`，`text.tertiary` 色

### 7.7 Chip 过滤器

- 使用 react-native-paper `Chip`
- `mode="outlined"`，`compact`
- 横向 ScrollView 可滚动

### 7.8 Snackbar

- 使用 react-native-paper `Snackbar`
- `duration: 2200`（操作反馈）

---

## 8. Motion

| 场景 | 时长 | 说明 |
|------|------|------|
| 按压反馈 | 即时 | RN Pressable 默认 opacity 变化 |
| 页面转场 | ~300ms | Expo Router Stack 默认 |
| Sheet 展开 | ~300ms | 底部 Sheet 滑入 |
| RefreshControl | 系统默认 | 下拉刷新 |

**原则**：
- 动效短、可打断
- 不使用自定义复杂动画
- 尊重系统级 `Reduce Motion` 设置

---

## 9. Icons

- **图标库**：MaterialCommunityIcons（通过 react-native-paper `Icon`）
- **默认色**：`text.secondary`
- **激活/强调色**：`text.primary` 或 AI 紫 `#6D5DFB`
- **尺寸规范**：

| 场景 | 尺寸 |
|------|------|
| 底栏按钮 | 21-22px |
| 底栏 AI 图标 | 18px |
| 列表项图标 | 18px |
| 空状态图标 | 42px |
| Appbar 操作 | 22px |

---

## 10. Touch targets

- **所有可点击元素**：最小命中区域 `44×44px`（含 padding 或透明热区）
- 底栏按钮：`width: 44, height: 44`
- 列表项整行可点击
- 归档/操作按钮：`36×36` 可视 + padding 达到 44px 命中

---

## 11. Safe area & keyboard

- **顶部**：`paddingTop: insets.top`（通过 `useSafeAreaInsets`）
- **底部**：浮动元素 `paddingBottom: max(insets.bottom, 12)`
- **键盘**：使用 `react-native-keyboard-controller` 的 `KeyboardStickyView` 处理键盘弹出
- **ScrollView 底部**：`paddingBottom: insets.bottom + 80`（为浮动底栏留空间）

---

## 12. Do & Don't

### Do

- 用 `useTheme()` 获取色值，通过 `tokens.ts` 驱动 Light/Dark
- 浮动元素用 **白底/半透明底 + 1px 边框 + 轻阴影**，与页面背景拉开
- 保持字号落在 `tokens.typography` 的 8 个层级之一
- 圆角使用 `tokens.radii` 中的值
- 所有间距基于 8pt grid（`tokens.spacing`）
- 触控目标最小 44×44px
- 三个底栏入口**各自独立**，功能零重叠（搜索=找、AI=问、新建=写）

### Don't

- 不要硬编码色值（除 `rgba()` 透明度变体）
- 不要第二套彩色强调；AI 紫 `#6D5DFB` 之外不引入新彩色
- 不要重阴影（`shadowOpacity` 不超过 `0.15`）
- 不要把浮动栏包在一个大 bar 容器里（三元素独立）
- 不要顶部放输入框（输入框浮在底部，拇指可达）
- 不要在底栏按钮中加文字标签（图标即含义，AI pill 除外）
- 不要用 `StyleSheet.hairlineWidth` 以外的粗线分割页面
- 不要用重渐变、毛玻璃等装饰效果

---

## 13. Iteration checklist

1. 是否只有 **两种** 彩色（系统蓝 + AI 紫），其余全部中性灰阶？
2. 浅/深是否都用 **表面阶梯** 而非纯白刺眼或纯黑死底？
3. 字号是否落在 `tokens.typography` 的 8 级之一？
4. 圆角是否使用 `tokens.radii` 中的值？
5. 间距是否基于 8pt grid？
6. 所有触控目标是否 ≥ 44×44px？
7. 浮动元素是否有 **边框 + 轻阴影**，与背景拉开？
8. 输入框是否在 **底部浮动**，而非顶部？
9. 是否正确处理了 **Safe Area**（top + bottom）？
