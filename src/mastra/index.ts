import { Mastra } from '@mastra/core';
import { registerApiRoute } from '@mastra/core/server';
import { PostgresStore } from '@mastra/pg';
import { docsAgent } from './agents/docs-agent';
import { listModels, resolveModel, MODELS, DEFAULT_MODEL } from './models/registry';

export const mastra = new Mastra({
  agents: { docsAgent },
  storage: new PostgresStore({ id: 'superdocs', connectionString: process.env.DATABASE_URL! }),
  server: {
    apiRoutes: [
      registerApiRoute('/app/models', {
        method: 'GET',
        handler: async (c) => c.json({ models: listModels() }),
      }),
      registerApiRoute('/app/chat', {
        method: 'POST',
        handler: async (c) => {
          let body: any;
          try { body = await c.req.json(); } catch { return c.json({ error: '请求体需为 JSON' }, 400); }
          const { messages, model, resource = 'owner', thread } = body || {};
          if (!messages) return c.json({ error: 'messages 必填' }, 400);
          const modelId = model && MODELS[model] ? model : DEFAULT_MODEL;
          const result: any = await docsAgent.stream(messages, {
            model: resolveModel(modelId),
            ...(thread ? { memory: { resource, thread } } : {}),
          });
          if (typeof result?.toUIMessageStreamResponse === 'function') return result.toUIMessageStreamResponse();
          if (typeof result?.toTextStreamResponse === 'function') return result.toTextStreamResponse();
          return new Response(result?.textStream ?? '', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        },
      }),
    ],
  },
});
