import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Mastra } from '@mastra/core';
import { registerApiRoute } from '@mastra/core/server';
import { PostgresStore } from '@mastra/pg';
import { docsAgent } from './agents/docs-agent';
import { listModels } from './models/registry';
import { ensureSchema } from './db/schema';
import { authRoutes } from './routes/auth';
import { chatRoutes } from './routes/chat';
import { conversationRoutes } from './routes/conversations';
import { profileRoutes } from './routes/profile';

// 默认取运行目录下的 public/（部署时可用 PUBLIC_DIR 显式覆盖），不再硬编码绝对路径。
const PUBLIC_DIR = process.env.PUBLIC_DIR || join(process.cwd(), 'public');
const CT = (p: string) =>
  p.endsWith('.js') ? 'text/javascript; charset=utf-8'
  : p.endsWith('.css') ? 'text/css; charset=utf-8'
  : p.endsWith('.html') ? 'text/html; charset=utf-8'
  : p.endsWith('.woff2') ? 'font/woff2'
  : p.endsWith('.woff') ? 'font/woff'
  : 'text/plain; charset=utf-8';

// 启动即幂等建账号表（失败仅告警；各路由首次访问还会再 ensureSchema 重试）
ensureSchema().catch((e) => console.error('[db] ensureSchema 失败:', e?.message || e));

export const mastra = new Mastra({
  agents: { docsAgent },
  storage: new PostgresStore({ id: 'superdocs', connectionString: process.env.DATABASE_URL! }),
  server: {
    apiRoutes: [
      // 公开：模型列表 + 静态 UI / 资源
      registerApiRoute('/app/models', { method: 'GET', handler: async (c) => c.json({ models: listModels() }) }),
      registerApiRoute('/app/ui', { method: 'GET', handler: async (c) => { try { return c.html(readFileSync(PUBLIC_DIR + '/index.html', 'utf8')); } catch { return c.text('UI not found', 404); } } }),
      registerApiRoute('/app/assets/:path', { method: 'GET', handler: async (c) => { const p = c.req.param('path'); if (!/^[A-Za-z0-9._-]+$/.test(p)) return c.text('bad', 400); try { return new Response(readFileSync(PUBLIC_DIR + '/' + p) as any, { headers: { 'content-type': CT(p), 'cache-control': 'public, max-age=86400' } }); } catch { return c.text('not found', 404); } } }),

      // 鉴权 / 对话 / 会话管理 / 个人页（除登录注册外均要求登录）
      ...authRoutes,
      ...chatRoutes,
      ...conversationRoutes,
      ...profileRoutes,
    ],
  },
});
