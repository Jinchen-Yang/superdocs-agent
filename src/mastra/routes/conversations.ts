import { registerApiRoute } from '@mastra/core/server';
import { randomUUID } from 'node:crypto';
import { memory } from '../memory/memory';
import { authed } from '../auth/guard';

// 用 any 调用 Mastra Memory：运行时契约已按 .d.ts 校验，绕开跨版本泛型摩擦。
const mem = memory as any;

// 个人记忆专用线程的前缀（profile.ts 会建 wm-<userId>），不计入会话列表。
const PROFILE_PREFIX = 'wm-';

function textOf(p: any): string {
  if (p == null) return '';
  if (typeof p === 'string') return p;
  return p.text || p.content || '';
}
function normalizeContent(content: any): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(textOf).join('');
  if (content.parts) return (content.parts as any[]).map(textOf).join('');
  return content.text || content.content || '';
}

// 校验会话归属，返回 thread 对象或 null。
async function owned(threadId: string, userId: string): Promise<any | null> {
  const t = await mem.getThreadById({ threadId, resourceId: userId }).catch(() => null);
  return t && t.resourceId === userId ? t : null;
}

export const conversationRoutes = [
  registerApiRoute('/app/conversations', {
    method: 'GET',
    handler: authed(async (c, u) => {
      const out = await mem.listThreads({
        filter: { resourceId: u.id },
        orderBy: { field: 'updatedAt', direction: 'DESC' },
        perPage: false,
      });
      const threads = (out?.threads || [])
        .filter((t: any) => !String(t.id).startsWith(PROFILE_PREFIX))
        .map((t: any) => ({ id: t.id, title: t.title || '新对话', updatedAt: t.updatedAt }))
        .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return c.json({ conversations: threads });
    }),
  }),

  registerApiRoute('/app/conversations', {
    method: 'POST',
    handler: authed(async (c, u) => {
      const id = randomUUID();
      const now = new Date();
      const t = await mem.saveThread({
        thread: { id, title: '新对话', resourceId: u.id, createdAt: now, updatedAt: now, metadata: {} },
      });
      return c.json({ conversation: { id: t.id, title: t.title, updatedAt: t.updatedAt } });
    }),
  }),

  registerApiRoute('/app/conversations/:id', {
    method: 'PATCH',
    handler: authed(async (c, u) => {
      const id = c.req.param('id');
      const existing = await owned(id, u.id);
      if (!existing) return c.json({ error: '会话不存在' }, 404);
      let body: any;
      try { body = await c.req.json(); } catch { body = {}; }
      const title = String(body?.title || '').trim().slice(0, 80) || '新对话';
      const t = await mem.updateThread({ id, title, metadata: existing.metadata || {} });
      return c.json({ conversation: { id: t.id, title: t.title, updatedAt: t.updatedAt } });
    }),
  }),

  registerApiRoute('/app/conversations/:id', {
    method: 'DELETE',
    handler: authed(async (c, u) => {
      const id = c.req.param('id');
      if (!(await owned(id, u.id))) return c.json({ error: '会话不存在' }, 404);
      try {
        await mem.deleteThread(id);
      } catch {
        // Mastra 在观察记忆未启用时 deleteThread 末尾的 clearObservationalMemory 可能抛错，
        // 但线程本体已在事务里删除；确认其确实不存在则视为成功。
        const still = await mem.getThreadById({ threadId: id, resourceId: u.id }).catch(() => null);
        if (still) return c.json({ error: '删除失败' }, 500);
      }
      return c.json({ ok: true });
    }),
  }),

  registerApiRoute('/app/conversations/:id/messages', {
    method: 'GET',
    handler: authed(async (c, u) => {
      const id = c.req.param('id');
      if (!(await owned(id, u.id))) return c.json({ error: '会话不存在' }, 404);
      const out = await mem.recall({ threadId: id, resourceId: u.id, perPage: false });
      const messages = (out?.messages || [])
        .filter((m: any) => m.role === 'user' || m.role === 'assistant')
        .map((m: any) => ({ role: m.role, content: normalizeContent(m.content) }))
        .filter((m: any) => m.content);
      return c.json({ messages });
    }),
  }),
];
