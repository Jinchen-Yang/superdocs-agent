import { registerApiRoute } from '@mastra/core/server';
import { memory } from '../memory/memory';
import { publicUser } from '../auth/user';
import { authed } from '../auth/guard';
import { query } from '../db/pool';

const mem = memory as any;

// 个人记忆（working memory，scope=resource）需要一个 threadId 才能读写；
// 用一个稳定的专用线程 wm-<userId>，与该用户所有会话共享同一份 resource 级记忆。
const profileThreadId = (userId: string) => `wm-${userId}`;

async function ensureProfileThread(userId: string): Promise<string> {
  const id = profileThreadId(userId);
  const t = await mem.getThreadById({ threadId: id, resourceId: userId }).catch(() => null);
  if (!t) {
    const now = new Date();
    await mem.saveThread({
      thread: { id, title: '__profile__', resourceId: userId, createdAt: now, updatedAt: now, metadata: { kind: 'profile' } },
    });
  }
  return id;
}

export const profileRoutes = [
  registerApiRoute('/app/profile', {
    method: 'GET',
    handler: authed(async (c, u) => {
      let workingMemory = '';
      try {
        const tid = await ensureProfileThread(u.id);
        workingMemory = (await mem.getWorkingMemory({ threadId: tid, resourceId: u.id })) || '';
      } catch { /* 记忆读取失败不致命 */ }

      const total = (await query<any>(
        'SELECT COALESCE(SUM(input_tokens),0)::int AS input, COALESCE(SUM(output_tokens),0)::int AS output, COUNT(*)::int AS calls FROM app_usage WHERE user_id=$1',
        [u.id],
      ))[0];
      const today = (await query<any>(
        "SELECT COALESCE(SUM(input_tokens),0)::int AS input, COALESCE(SUM(output_tokens),0)::int AS output, COUNT(*)::int AS calls FROM app_usage WHERE user_id=$1 AND created_at >= date_trunc('day', now())",
        [u.id],
      ))[0];
      const byModel = await query<any>(
        'SELECT model, COALESCE(SUM(input_tokens),0)::int AS input, COALESCE(SUM(output_tokens),0)::int AS output FROM app_usage WHERE user_id=$1 GROUP BY model ORDER BY (COALESCE(SUM(input_tokens),0)+COALESCE(SUM(output_tokens),0)) DESC',
        [u.id],
      );

      return c.json({
        user: publicUser(u),
        workingMemory: typeof workingMemory === 'string' ? workingMemory : '',
        usage: { total, today, byModel },
      });
    }),
  }),

  registerApiRoute('/app/profile', {
    method: 'PUT',
    handler: authed(async (c, u) => {
      let body: any;
      try { body = await c.req.json(); } catch { return c.json({ error: '请求体需为 JSON' }, 400); }
      const wm = String(body?.workingMemory ?? '');
      try {
        const tid = await ensureProfileThread(u.id);
        await mem.updateWorkingMemory({ threadId: tid, resourceId: u.id, workingMemory: wm });
      } catch (e: any) {
        return c.json({ error: '保存失败：' + (e?.message || e) }, 500);
      }
      return c.json({ ok: true });
    }),
  }),
];
