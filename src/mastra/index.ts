import { readFileSync } from 'node:fs';
import { Mastra } from '@mastra/core';
import { registerApiRoute } from '@mastra/core/server';
import { PostgresStore } from '@mastra/pg';
import { docsAgent } from './agents/docs-agent';
import { listModels, resolveModel, MODELS, DEFAULT_MODEL } from './models/registry';

const PUBLIC_DIR = process.env.PUBLIC_DIR || '/home/cloudlay/superdocs-agent/public';
const CT = (p: string) => (p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : 'text/plain') + '; charset=utf-8';

export const mastra = new Mastra({
  agents: { docsAgent },
  storage: new PostgresStore({ id: 'superdocs', connectionString: process.env.DATABASE_URL! }),
  server: {
    apiRoutes: [
      registerApiRoute('/app/models', { method: 'GET', handler: async (c) => c.json({ models: listModels() }) }),
      registerApiRoute('/app/chat', {
        method: 'POST',
        handler: async (c) => {
          let body: any;
          try { body = await c.req.json(); } catch { return c.json({ error: '请求体需为 JSON' }, 400); }
          const { messages, model, resource = 'owner', thread } = body || {};
          if (!messages) return c.json({ error: 'messages 必填' }, 400);
          const modelId = model && MODELS[model] ? model : DEFAULT_MODEL;
          const threadId: string = thread || globalThis.crypto?.randomUUID?.() || `t-${Date.now()}`;
          const result: any = await docsAgent.stream(messages, { model: resolveModel(modelId), memory: { resource, thread: threadId } });
          const base: Response =
            (typeof result?.toUIMessageStreamResponse === 'function' && result.toUIMessageStreamResponse()) ||
            (typeof result?.toTextStreamResponse === 'function' && result.toTextStreamResponse()) ||
            new Response(result?.textStream ?? '', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
          const headers = new Headers(base.headers);
          headers.set('X-Thread-Id', threadId); headers.set('X-Model', modelId);
          return new Response(base.body, { status: base.status, headers });
        },
      }),
      registerApiRoute('/app/ui', { method: 'GET', handler: async (c) => { try { return c.html(readFileSync(PUBLIC_DIR + '/index.html', 'utf8')); } catch { return c.text('UI not found', 404); } } }),
      registerApiRoute('/app/assets/:path', { method: 'GET', handler: async (c) => { const p = c.req.param('path'); if (!/^[A-Za-z0-9._-]+$/.test(p)) return c.text('bad', 400); try { return new Response(readFileSync(PUBLIC_DIR + '/' + p, 'utf8'), { headers: { 'content-type': CT(p) } }); } catch { return c.text('not found', 404); } } }),
    ],
  },
});
