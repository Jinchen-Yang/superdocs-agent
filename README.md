# superdocs

给北邮学生用的 AI 助手,做两件事:在 BYR Docs 上搜资料,以及回答新生常问的问题。搜的是教材、真题、复习资料;答的是宿舍、选课、校园网、报到这类事,答案都带来源链接。

后端用 Mastra(基于 Hono),数据放在 PostgreSQL 加 pgvector,模型接的是国内几家;前端是 React 配 assistant-ui。

## 功能

文档检索。索引了 BYR Docs 的教材、试题、资料元信息一千多条,中文分词用 MiniSearch 加 nodejs-jieba。下载链接按文件 md5 生成,本地镜像里有就走镜像,没有就回退原站。

知识库答疑。摄入了北邮生存指南和真题 wiki,切成三百多个知识块。校园生活和真题类的问题直接从知识库里答,并标出处。

多模型。DeepSeek V4、智谱 GLM、通义千问都接了,支持多模态和深度思考开关。模型集中在一处注册,增删改动一个文件就行。

账号与登录。本地账号用用户名密码(密码走 scrypt),也支持北邮统一认证(基于 bupt-auth)。本地账号必须绑定到统一认证的学号,一个学号对应一个账号;绑定之后,本地密码和统一认证两种方式都能登进同一个账号。会话用签名 cookie,服务端无状态。对话历史、个人记忆、token 用量都存库。

校园门禁。可选开关。打开后只放行校园网 IP 段内、或通过统一认证的用户,默认关闭。

内嵌气泡。宿主页面加一行 script 就能把助手挂成右下角的悬浮气泡,内容跑在 iframe 里,和宿主页样式互不干扰。

前端。React 19、Vite、Tailwind v4、assistant-ui,流式输出,Markdown 和 KaTeX,深浅色主题,移动端做了适配。

## 架构

```
web/ 前端 (React + assistant-ui)
  │  fetch /app/*
  ▼
Mastra Server (Hono 路由)
  ├─ 鉴权(签名 cookie)
  ├─ docsAgent
  │    ├─ 工具: 文档检索 / 知识库检索 (MiniSearch + jieba)
  │    └─ 记忆: lastMessages / semanticRecall(pgvector) / workingMemory
  └─ 多模型注册表
  ▼
PostgreSQL + pgvector
```

技术栈:Mastra、Hono、PostgreSQL/pgvector、MiniSearch、nodejs-jieba、AI SDK、React 19、Vite、Tailwind v4、assistant-ui。

## 运行

需要 Node 20 以上(建议 22)、PostgreSQL 14 以上且装了 pgvector、至少一个模型的 API key。

后端:

```bash
cp .env.example .env                 # 填 DATABASE_URL、模型 key、APP_SESSION_SECRET
npm install
node scripts/refresh-metadata.mjs    # 编译文档元信息到 data/metadata.json
node scripts/build-knowledge.mjs     # 编译知识库到 data/knowledge.json
npm run dev                          # 监听 3100
```

前端:

```bash
cd web && npm install
npm run dev                          # vite,API 代理到 3100;或 npm run build 出 web/dist
```

然后打开 http://localhost:3100/app/ui。

## 环境变量

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | Postgres 连接串,库要装 pgvector |
| `DEEPSEEK_API_KEY` / `ZHIPU_API_KEY` / `QWEN_API_KEY` | 模型 key,按需填,缺哪个对应模型就不可用 |
| `APP_SESSION_SECRET` | 会话签名密钥,生产必填(`openssl rand -hex 32`) |
| `NODE_ENV` | 设为 `production` 时启用 Secure cookie 并强制校验 SECRET |
| `PORT` | 端口,默认 3100 |
| `NEXT_DIR` | 前端构建产物目录,默认 `web/dist` |

校园门禁、验证码 OCR、管理员、内嵌相关的可选变量见 `.env.example`。

数据产物(`data/metadata.json`、`data/knowledge.json`)由 `scripts/` 预编译,不进版本库,随部署一起同步过去。

## 部署

```bash
npm run build                # mastra build,产物在 .mastra/output
cd web && npm run build      # vite build,产物在 web/dist
# 运行: NODE_ENV=production node .mastra/output/index.mjs
# nginx 把 /app/ 反代到 3100,就能挂在任意站点的子路径下
```

## 数据来源

知识库和文档元信息来自下面这些开源项目,各自遵循其许可:

- BYR Docs 文档元信息(byrdocs/byrdocs-archive)
- 北邮生存指南(byrdocs/bupt-survival-guide),CC-BY-SA-4.0
- BYR Docs 真题 wiki(byrdocs/byrdocs-neowiki),CC-BY-NC-SA-4.0

## 许可

代码许可证按需添加。知识库数据遵循上游 CC 许可,其中含非商业(NC)条款,请勿商用。
