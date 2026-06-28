# superdocs-web 前端功能记录（重构基线 / Feature Inventory）

> 用途：这是 **重构前的功能快照**。下一步要把整套 UI 从「Liquid Glass」磨砂玻璃风换成 **简约（minimalist）风、参考 DeepSeek Chat**。
> 本文件是「不能丢的东西」的权威清单——重写时**所有功能与 API 契约必须保留**，只换视觉系统与交互外观。
> 现状栈：React 19 + Vite 8 + Tailwind v4 + `@assistant-ui/react`（external-store runtime）。
> 快照时间：2026-06-28，对应分支 `feat/agent-link-and-local-first`（HEAD `aca84f4`）。

---

## 0. 一句话定位

`superdocs-web` 是 **superdocs-agent**（Mastra 后端）的网页前端：北邮同学的 AI 助手，查资料 / 看真题 / 课程答疑 / 新生引导，答不了就联网兜底并标注来源。构建为纯静态产物，由后端在 `/app/ui` + `/app/assets/*` 下托管；同一套产物也用于 **嵌入气泡**（iframe `?embed=1`）。

---

## 1. 技术栈与构建（现状）

| 维度 | 现状 |
| --- | --- |
| 框架 | React 19.2 + TypeScript 6 |
| 构建 | Vite 8，`base=/app/`（资源走 `/app/assets/*`），产物 `web/dist`，`emptyOutDir` |
| 样式 | Tailwind v4（`@tailwindcss/vite`）+ 自定义 CSS 变量主题（`index.css`） |
| 对话内核 | `@assistant-ui/react` 0.14（`useExternalStoreRuntime` 外部存储模式）+ `@assistant-ui/react-markdown` |
| Markdown/数学 | `remark-gfm` + `remark-math` + `rehype-katex` + `katex` |
| 图标 | `lucide-react` |
| 部署 | 在 dev 机 `web && npm run build` → `dist` → rsync 到生产；后端 `process.env.NEXT_DIR` 指向 `web/dist`，`/app/ui` 与 `/app/assets` 读它 |
| dev 代理 | `vite` dev server 把 `/app/auth /app/chat /app/conversations /app/profile /app/models /app/admin /app/health` 代理到 `127.0.0.1:3100` |

---

## 2. 模块依赖图（结构先行）

```
main.tsx ── 挂载 + 移动端键盘高度 --kb（visualViewport）
  └─ App.tsx ── 顶层状态机：view∈{loading,auth,app}，user/models/model/thinking/theme/mobile/embed
       ├─ Background.tsx ........ 全屏渐变 + 3 个漂浮光晕 blob（纯装饰，待替换）
       ├─ AuthGate.tsx .......... 未登录门：统一认证(SSO) / 旧账号合并(migrate)
       ├─ Sidebar.tsx ........... 会话列表（今天/更早分组、重命名、删除）+ 账号入口
       ├─ Topbar.tsx ............ 模型下拉 + 深度思考开关 + 主题切换 + (embed)关闭 + (mobile)菜单
       ├─ chat/
       │    ├─ useChatController.ts .. 核心：external-store runtime、流式 /app/chat、附件、会话切换
       │    ├─ Thread.tsx ........... Welcome 欢迎页 + 消息气泡 + Composer 输入框
       │    └─ markdown-text.tsx .... 助手正文 Markdown 渲染（GFM+KaTeX，外链新标签页）
       ├─ AccountModal.tsx ...... 账号页：用量统计 + 个人记忆编辑 + 退出 + (admin)入口
       ├─ AdminModal.tsx ........ 管理统计（仅 isAdmin）
       ├─ Dialog.tsx ............ 通用模态：焦点陷阱 + Esc + 恢复焦点（a11y 基座）
       └─ Toast.tsx ............. 全局轻提示（aria-live）
  api.ts ... 所有 HTTP 调用（fetch 封装 + ApiError）
  types.ts . 类型契约（User/ModelMeta/Conversation/ChatMessage/Usage/Profile/AdminStats）
```

---

## 3. 后端 API 契约（前端依赖面，重写不可变）

所有路由前缀 `/app/*`（Mastra 保留 `/api`）。鉴权走 Cookie（`sd_session`，HttpOnly，生产 `SameSite=None; Partitioned`）。

### 认证
| 方法 | 路径 | 入参 | 出参 | 用途 |
| --- | --- | --- | --- | --- |
| GET | `/app/auth/me` | — | `{user}` | 启动时探当前登录态；失败→进登录页 |
| POST | `/app/auth/sso` | `{studentId, password}` | `{user}` | 北邮统一认证登录（主入口，校内外通用，不存密码） |
| POST | `/app/auth/merge` | `{oldUsername, oldPassword, studentId, ssoPassword}` | `{user}` | 把改版前本地账号合并进统一认证账号 |
| POST | `/app/auth/login` | `{username, password}` | `{user}` | 旧本地密码登录（**已不在 UI 暴露**，仅 api.ts 保留） |
| POST | `/app/auth/embed` | `{token}` | `{user}` | 嵌入模式：宿主签发 token 自动登录（方案 A） |
| GET | `/app/auth/whoami` | — | `{ip, campus, gate, cidrs}` \| null | 登录页提示「是否在校园网内」 |
| POST | `/app/auth/logout` | — | — | 退出 |

### 模型 / 会话 / 资料
| 方法 | 路径 | 出参 | 用途 |
| --- | --- | --- | --- |
| GET | `/app/models` | `{models: ModelMeta[]}` | 模型注册表（id/label/provider/multimodal/thinking） |
| GET | `/app/conversations` | `{conversations: Conversation[]}` | 侧边栏会话列表（含 updatedAt） |
| PATCH | `/app/conversations/:id` | `{conversation}` | 重命名（body `{title}`） |
| DELETE | `/app/conversations/:id` | — | 删除会话 |
| GET | `/app/conversations/:id/messages` | `{messages: ServerMessage[]}` | 打开历史会话，回填消息 |
| GET | `/app/profile` | `Profile{user, workingMemory, usage}` | 账号页：个人记忆 + 用量 |
| PUT | `/app/profile` | — | 保存个人记忆（body `{workingMemory}`） |
| GET | `/app/admin/stats` | `AdminStats` | 管理统计（仅管理员） |

### 对话流（核心，NDJSON 流式）
- **请求** `POST /app/chat`，body：
  ```jsonc
  {
    "messages": [{ "role": "user", "content": <string | [{type:'text',text},{type:'image',image:dataUrl}]> }],
    "model":   "<模型 id>",
    "thread":  "<会话 id（前端生成的 uid 或已有会话 id）>",
    "thinking": <bool 深度思考>
  }
  ```
  有图：`content` 用多模态分块数组；无图：纯文本字符串。
- **响应**：按行分隔的 NDJSON，每行一个 JSON `{t, d}`：
  | `t` | 含义 | 前端处理 |
  | --- | --- | --- |
  | `"t"` | 正文 token（text delta） | 累加进 `content` |
  | `"r"` | 思考过程（reasoning delta） | 累加进 `reasoning`，渲染为可折叠「💭 思考过程」 |
  | `"tool"` | 工具调用（检索中） | 置 `searching=true`，正文未到时显示「🔍 正在检索北邮资料…」 |
  | `"err"` | 错误 | 追加「[出错] …」到正文 |
- **鉴权失效**：响应 `401/403` → 触发 `onAuthExpired`，清用户、回登录页。
- **中断**：`AbortController`，停止按钮 / 切会话 / 新建会话都会 abort。

---

## 4. 功能清单（分组：做什么 / 文件 / 关键行为与边界）

### 4.1 认证门 Auth Gate — `AuthGate.tsx` / `App.tsx`
- **三态视图机**：`loading`（启动转圈）→ `auth`（登录页）/ `app`（主界面）。启动 `api.me()` 决定。
- **登录主入口 = 北邮统一认证（SSO）**：学号 + 统一认证密码；文案标注「仅验证身份不存储密码」。
- **校园网提示**：`whoami()` 返回 `gate` 时，显示「✓ 你在校园网内」或「校外访问：用统一认证登录即可」。
- **旧账号合并（migrate 模式）**：旧用户名/密码 + 学号/统一认证密码双重验证 → 合并历史对话到统一认证账号。两种模式可切换。
- **键盘可达**：Enter 提交（防重复提交 busy 锁）。
- **登录态生命周期**：登录成功 `afterLogin()` → 拉 `models` + `conversations`；`onAuthExpired`（流式 401/403）→ 退回登录页；`logout()` → 清状态 + 新建空会话。

### 4.2 对话核心 + 流式 — `useChatController.ts` / `Thread.tsx`
- **external-store runtime**：前端自己持有 `messages: ChatMessage[]`，用 `useExternalStoreRuntime` 接 assistant-ui，`convertMessage` 把内部消息转成 assistant-ui 的分块（text / reasoning / image）。
- **发送 `send(text)`**：push 用户消息 + 占位助手消息 → `fetch('/app/chat')` 读流 → 逐行 `handle()` 累加 → `patch()` 增量更新。
- **流式分块**：见 §3 的 `t/r/tool/err`。`searching` 仅在「有检索且正文还没来」时显示占位。
- **空回复兜底**：流结束后正文+思考都空 → 显示「（无回复，请检查模型配置）」。
- **错误兜底**：非 abort 的异常 → 追加「出错：…」。
- **并发保护**：`abortRef` 存在时拒绝再次发送（一次一条）。
- **会话归属**：首条消息发完，若当前没有 activeId，就把 `thread`（uid）设为 activeId；并通知刷新会话列表。

### 4.3 模型选择 + 深度思考 — `Topbar.tsx` / `App.tsx`
- **模型下拉**：列出 `/app/models`，显示 label / provider，带「深度思考」徽标（`thinking` 模型）、当前项打勾。绿点表示在线。
- **深度思考开关**：仅当前模型 `thinking=true` 时出现；切到非 thinking 模型自动关。`thinking` 随请求发给后端。
- **默认模型**：初始 `deepseek-v4-flash`；登录后取 `models[0]`。

### 4.4 多模态图片 — `useChatController.ts` / `Thread.tsx`（Composer）/ `App.tsx`
- **上传**：Composer 图片按钮 → 选图（仅 `image/*`，< 8MB）→ `FileReader` 转 dataURL 存为附件。
- **自动切模型**：附件加上 → App 自动切到第一个 `multimodal` 模型并关思考；移除/发送后 → 切回 `deepseek-v4-flash`（「平时保持 DeepSeek」）。无多模态模型时报错。
- **预览**：Composer 顶部显示缩略图 + 移除按钮 + 「已自动切换多模态模型识别图片」提示。
- **回显**：用户消息里带图（气泡内显示）；请求 `content` 用 `[{text},{image}]` 多模态数组。

### 4.5 会话列表 / 侧边栏 — `Sidebar.tsx`
- **分组**：「今天 Today」/「更早 Earlier」（按 `updatedAt` 是否今天）。
- **每行**：首字母色块 + 标题截断；激活态高亮（frost + 加粗）。
- **行内菜单**：`⋯` → 重命名（行内 input，Enter 提交 / Esc 取消 / blur 保存）/ 删除（confirm 二次确认）。
- **新对话**按钮、**空态**文案。
- **底部账号入口**：头像（avatarSeed 首字母）+ 名 + 「账号 · 个人页」→ 打开 AccountModal。
- **品牌**：顶部 superdocs logo（Sparkles + 渐变方块）。

### 4.6 欢迎页 + 建议卡 — `Thread.tsx`（Welcome）
- **问候语**：按当前小时变化（夜深 / 早上好 / 下午好 / 晚上好）。
- **4 张建议卡**（点击直接发送对应 prompt，绕过 composer 走 `SendContext`）：高数期末真题 / 沙河校区生活 / 数据结构复习资料 / 报到准备。每张有图标色。
- **空会话时**居中展示，有消息后隐藏。

### 4.7 消息渲染 — `Thread.tsx` / `markdown-text.tsx`
- **用户气泡**：右对齐，渐变背景，圆角 `18/18/5/18`，`whitespace-pre-wrap`。
- **助手消息**：左侧 Sparkles 头像 + frost 气泡，圆角 `6/20/20/20`。
- **Markdown**：GFM（表格/列表/任务）+ KaTeX 数学公式（`remark-math`+`rehype-katex`），`.aui-md` 样式；外链一律 `target=_blank`（点「来源」不丢会话）。
- **思考过程**：可折叠 `<details open>`「💭 思考过程」，流式时即时可见，最大高度 48 滚动。
- **复制按钮**：助手正文下方「复制 / 已复制」（仅复制 text 分块，不含思考/占位）。
- **入场动画**：`msgIn`（待替换/保留视情况）。

### 4.8 账号页 — `AccountModal.tsx`
- **头部**：头像 + displayName + `@username · provider` + 关闭。
- **用量统计**：今日 tokens / 累计 tokens / 对话次数（`fmt` 千分位 k/M），按模型分行。
- **个人记忆 Working Memory**：textarea 编辑 + 保存（`PUT /app/profile`，toast 反馈）。占位文案说明助手会自动记录学号/姓名/学院/课程/偏好。
- **管理入口**：`isAdmin` 时显示「📊 管理统计」→ AdminModal。
- **退出登录**。

### 4.9 管理统计 — `AdminModal.tsx`（仅 `isAdmin`）
- 用户（总/已绑定/真正在用）、Token 消耗（累计/今日/对话次数，入/出分解）、按模型分行、Top 用户（按 token，名+学号+次数）。加载/错误态。

### 4.10 主题 light/dark — `App.tsx` / `index.css`
- `theme` 持久化到 `localStorage('sd-theme')`，切 `<html class="dark">`。Topbar 太阳/月亮切换。
- 一整套 CSS 变量双主题（accent/text/sub/faint/glass/blob/root-bg/shadow…）。

### 4.11 移动端与响应式 — `App.tsx` / `main.tsx` / `index.css`
- **断点**：`mobile = innerWidth <= 760`（resize 监听）。
- **侧边栏抽屉**：移动端固定定位 + 平移动画 + 半透明遮罩 + **Esc 关闭**；桌面端常驻。
- **安全区**：`env(safe-area-inset-*)`（刘海/灵动岛/Home 条）；main 顶/左/右/底 padding 适配。
- **iOS 键盘**：`body position:fixed` 锁死整页（不滚不跳），`main.tsx` 把键盘高度写进 `--kb`（visualViewport），聊天区 `padding-bottom` 把输入框抬到键盘上方；补几拍重算抗 iOS 延迟；`interactive-widget=resizes-content`。
- **输入框**：16px 字号防 iOS 聚焦放大；仅桌面 autoFocus（移动端不自动弹键盘遮欢迎页）。

### 4.12 嵌入气泡 Embed — `public/widget.js` / `App.tsx` / `Topbar.tsx`
- **一行接入**：宿主页 `<script src=".../app/widget.js" data-accent data-position data-token>`。
- **Shadow DOM** 悬浮气泡 + iframe `/app/ui?embed=1`，样式与宿主完全隔离；移动端全屏面板。
- **方案 A token 桥**：iframe `postMessage('sd-embed-ready')` → 宿主回 `sd-embed-token` → `api.embed(token)` 自动登录。
- **embed 模式 UI 差异**：隐藏底部 ICP/署名页脚；Topbar 显示关闭按钮（postMessage `sd-embed-close`）+ 始终显示菜单按钮。

### 4.13 可访问性 a11y — `Dialog.tsx` / `Toast.tsx` / 各组件 aria
- **模态 Dialog**：`role=dialog` + `aria-modal` + **焦点陷阱**（Tab 循环）+ Esc 关闭 + 关闭后恢复焦点。AccountModal/AdminModal 走它。
- **Toast**：`role=status` + `aria-live=polite`，替代静默 catch，3.2s 自动消失。
- **aria 标签**：菜单/模型下拉 `aria-haspopup/expanded`、按钮 `aria-label`、加载 `role=status`、思考开关 `aria-pressed`。

### 4.14 视觉系统「Liquid Glass」 — `index.css` / `Background.tsx`（**本次重构要替换的部分**）
- 工具类：`.glass`（24px backdrop-blur + 半透明 + 高光内阴影）、`.frost`（弱化版）、`.accent-grad`（紫蓝渐变）。
- 背景：渐变 `--root-bg` + 3 个 18s 漂浮模糊光晕 `blobDrift`。
- 动画：`msgIn / riseIn / blobDrift`。圆角偏大、紫蓝品牌色 `#5b6cff→#8a5cff`。
- **→ 重构目标**：换成简约风（参考 DeepSeek Chat）——去玻璃/去光晕/去重渐变，留干净留白、扁平、克制配色。

### 4.15 杂项
- **页脚**（非 embed）：`新ICP备2025024799号` + `云间辞`（作者署名）。
- **品牌**：superdocs / 「柏邮仁智能助手」；`index.html` 带完整 OG / Twitter 分享卡（微信/QQ 链接卡，深色 1200×630）。
- **uid 生成**：`crypto.randomUUID` 兜底 `Date.now()+random`。

---

## 5. 重构红线：必须保留 vs 可替换

**必须 100% 保留（功能 + 契约）**
1. §3 全部 API 契约与 NDJSON 流式协议（后端不动）。
2. SSO 登录 + 旧账号合并 + 校园网提示 + 登录态生命周期。
3. 流式对话（text/reasoning/tool/err）、停止、空/错兜底、并发锁、会话归属。
4. 模型切换 + 深度思考开关（按模型能力显隐）。
5. 多模态图片上传 + 自动切模型 + 预览 + 回显。
6. 会话列表（分组/重命名/删除/激活/空态）+ 新对话。
7. 欢迎页问候 + 建议卡直发。
8. Markdown + KaTeX + 思考折叠 + 复制 + 外链新标签页。
9. 账号页（用量 + 个人记忆编辑保存）+ 管理统计（admin）。
10. 主题 light/dark 持久化。
11. 移动端：抽屉 + 安全区 + iOS 键盘 `--kb` 抬升 + 防放大。
12. 嵌入气泡（widget.js + `?embed=1` + token 桥 + embed UI 差异）。
13. a11y：模态焦点陷阱 / aria / toast。
14. 页脚 ICP + 署名、OG 分享卡、品牌名。
15. 构建契约：`base=/app/`、产物 `web/dist`、dev 代理。

**本次要替换（视觉/交互外观）**
- 「Liquid Glass」整套视觉（`.glass/.frost/.accent-grad/blob/重渐变/大圆角`）→ 简约扁平、克制配色、干净留白，**参考 DeepSeek Chat**。
- 助手/用户气泡样式、欢迎页排版、侧边栏密度、输入框形态、动画强度——按简约风重做。
- 待定：是否保留 `@assistant-ui/react` 作为对话内核（见重构方案讨论）。

---

_本文件随重构推进更新；重写完成后保留为「功能对照表」，逐条核对无遗漏。_
