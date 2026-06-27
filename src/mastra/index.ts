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
import { adminRoutes } from './routes/admin';

// 前端(Vite+React+assistant-ui)构建产物目录（部署时可用 NEXT_DIR 覆盖）。
const NEXT_DIR = process.env.NEXT_DIR || join(process.cwd(), 'web/dist');
// 允许把 /app/ui 内嵌(气泡 widget)的宿主站，逗号分隔，如 https://byrdocs.org；'self' 始终允许。
const FRAME_ANCESTORS = ["'self'", ...(process.env.EMBED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)].join(' ');
const CT = (p: string) =>
  p.endsWith('.js') ? 'text/javascript; charset=utf-8'
  : p.endsWith('.css') ? 'text/css; charset=utf-8'
  : p.endsWith('.html') ? 'text/html; charset=utf-8'
  : p.endsWith('.woff2') ? 'font/woff2'
  : p.endsWith('.woff') ? 'font/woff'
  : p.endsWith('.ttf') ? 'font/ttf'
  : p.endsWith('.svg') ? 'image/svg+xml'
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
      registerApiRoute('/app/ui', { method: 'GET', handler: async (c) => { try { c.header('Cache-Control', 'no-store'); c.header('Content-Security-Policy', 'frame-ancestors ' + FRAME_ANCESTORS); return c.html(readFileSync(NEXT_DIR + '/index.html', 'utf8')); } catch { return c.text('UI not built', 404); } } }),
      // 内嵌气泡加载器：宿主站 <script src=".../app/widget.js"> 一行接入。
      registerApiRoute('/app/widget.js', { method: 'GET', handler: async (c) => { try { return new Response(readFileSync(NEXT_DIR + '/widget.js', 'utf8'), { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=300' } }); } catch { return c.text('widget not built', 404); } } }),
      registerApiRoute('/app/assets/:path', { method: 'GET', handler: async (c) => { const p = c.req.param('path'); if (!/^[A-Za-z0-9._-]+$/.test(p)) return c.text('bad', 400); try { return new Response(readFileSync(NEXT_DIR + '/assets/' + p) as any, { headers: { 'content-type': CT(p), 'cache-control': 'public, max-age=86400' } }); } catch { return c.text('not found', 404); } } }),
      // 旧测试/单文件入口 → 重定向到正式 UI
      registerApiRoute('/app/next', { method: 'GET', handler: async (c) => c.redirect('/app/ui') }),

      // 鉴权 / 对话 / 会话管理 / 个人页（除登录注册外均要求登录）
      ...authRoutes,
      ...chatRoutes,
      ...conversationRoutes,
      ...profileRoutes,
      ...adminRoutes,
    ],
  },
});
