# superdocs · 北邮智能助手

> BYR Docs 资料检索 + 北邮新生答疑的 AI Agent。
> 基于 **Mastra + PostgreSQL/pgvector + 国内多模型**，前端 **React + assistant-ui**。

面向北邮（北京邮电大学）学生：检索教材 / 真题 / 复习资料，并基于知识库回答宿舍、选课、校园网、报到、真题等问题，回答附来源。

---

## ✨ 功能

- **📚 文档检索** — 检索 BYR Docs 的教材(book) / 试题(test) / 资料(doc) 共 1100+ 条元信息，`MiniSearch` + `nodejs-jieba` 中文分词；按 md5 生成下载链接（镜像优先、回退原站）。
- **🎓 新生答疑知识库** — 摄入「北邮生存指南」+「真题 wiki」共 300+ 知识块，直接答校园生活/真题类问题，回答标注来源链接。
- **🤖 多模型** — DeepSeek V4 / 智谱 GLM / 通义千问，支持多模态与「深度思考」开关；一处注册即可增删模型。
- **👤 账号体系** — 本地密码账号(scrypt)、无状态签名会话、会话持久化、个人记忆(working memory)、Token 用量统计；预留 SSO 接缝。
- **💬 现代前端** — React 19 + Vite + Tailwind v4 + assistant-ui：流式对话、Markdown + KaTeX、深浅主题、响应式。

## 🏗️ 架构

```
前端 web/ (React + assistant-ui)
  │  fetch /app/*
  ▼
Mastra Server (Hono 路由)
  ├─ 鉴权中间件（签名 cookie）
  ├─ Agent (docsAgent)
  │    ├─ 工具：文档检索 / 知识库检索（MiniSearch + jieba）
  │    └─ 记忆：lastMessages · semanticRecall(pgvector) · workingMemory
  └─ 多模型注册表
  ▼
PostgreSQL + pgvector
```

**技术栈**：Mastra · Hono · PostgreSQL/pgvector · MiniSearch · nodejs-jieba · AI SDK · React 19 · Vite · Tailwind v4 · assistant-ui

## 🚀 快速开始

**前置**：Node ≥ 20（推荐 22）、PostgreSQL ≥ 14（启用 `pgvector` 扩展）、至少一个模型 API key。

```bash
# 1) 后端
cp .env.example .env            # 填 DATABASE_URL / 模型 key / APP_SESSION_SECRET
npm install
node scripts/refresh-metadata.mjs   # 编译文档元信息 → data/metadata.json
node scripts/build-knowledge.mjs     # 编译知识库     → data/knowledge.json
npm run dev                     # mastra dev，监听 :3100

# 2) 前端
cd web && npm install
npm run dev                     # vite dev（API 代理到 :3100），或 npm run build → web/dist
```

打开 **http://localhost:3100/app/ui**

## ⚙️ 环境变量

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | Postgres 连接串（需 pgvector 扩展） |
| `DEEPSEEK_API_KEY` / `ZHIPU_API_KEY` / `QWEN_API_KEY` | 模型 key，按需填，缺哪个对应模型不可用 |
| `APP_SESSION_SECRET` | 会话签名密钥，**生产必填**（`openssl rand -hex 32`） |
| `NODE_ENV` | `production` 时启用 Secure cookie + 强制校验 SECRET |
| `PORT` | 服务端口，默认 `3100` |
| `NEXT_DIR` | 前端构建产物目录，默认 `web/dist` |
| `METADATA_PATH` | 文档索引路径，默认 `data/metadata.json` |

> 数据产物（`data/metadata.json`、`data/knowledge.json`）由 `scripts/` 预编译，不入库，随部署同步。

## 🚢 部署

```bash
npm run build                   # mastra build → .mastra/output
cd web && npm run build         # vite build  → web/dist
# 运行：NODE_ENV=production node .mastra/output/index.mjs
# 反向代理（nginx）把 /app/ 转发到 :3100，即可挂为任意站点的子路径（附页）
```

## 🗺️ 路线图

- [ ] 北邮统一认证 SSO（对接 [`byrdocs/bupt-auth`](https://github.com/byrdocs)）
- [ ] 校内网公开信息接入（教务 / 讲座 / 通知）
- [ ] 真题 / 讲义 Typst 源摄入

## 🙏 数据来源与致谢

知识库与文档元信息来自以下开源项目，遵循其各自许可：

- [BYR Docs](https://byrdocs.org) — 文档元信息（`byrdocs/byrdocs-archive`）
- [北邮生存指南](https://github.com/byrdocs/bupt-survival-guide) — CC-BY-SA-4.0
- [BYR Docs 真题 wiki](https://github.com/byrdocs/byrdocs-neowiki) — CC-BY-NC-SA-4.0

## 📄 许可

代码部分许可证请按需添加（如 MIT）。**知识库数据遵循上游 CC 许可，含非商业(NC)条款，请勿商用。**
