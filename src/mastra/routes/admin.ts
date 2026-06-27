import { registerApiRoute } from '@mastra/core/server';
import { authed } from '../auth/guard';
import { isAdmin } from '../auth/admin';
import { query } from '../db/pool';

const n = (v: any) => Number(v) || 0;

export const adminRoutes = [
  // 管理统计：仅管理员(ADMIN_IDS)可见。用户规模 + Token 消耗。
  registerApiRoute('/app/admin/stats', {
    method: 'GET',
    handler: authed(async (c, u) => {
      if (!isAdmin(u)) return c.json({ error: '无权限' }, 403);

      const users = (await query<any>(
        'SELECT COUNT(*)::int AS total, COUNT(external_id)::int AS bound FROM app_user',
      ))[0];
      const active = (await query<any>('SELECT COUNT(DISTINCT user_id)::int AS n FROM app_usage'))[0];
      const tok = (await query<any>(
        'SELECT COALESCE(SUM(input_tokens),0)::bigint AS input, COALESCE(SUM(output_tokens),0)::bigint AS output, COUNT(*)::int AS calls FROM app_usage',
      ))[0];
      const today = (await query<any>(
        "SELECT COALESCE(SUM(input_tokens),0)::bigint AS input, COALESCE(SUM(output_tokens),0)::bigint AS output, COUNT(*)::int AS calls FROM app_usage WHERE created_at >= date_trunc('day', now())",
      ))[0];
      const byModel = await query<any>(
        'SELECT model, COALESCE(SUM(input_tokens + output_tokens),0)::bigint AS tokens, COUNT(*)::int AS calls FROM app_usage GROUP BY model ORDER BY tokens DESC',
      );
      const topUsers = await query<any>(
        `SELECT au.display_name, au.username, au.external_id,
                COALESCE(SUM(u.input_tokens + u.output_tokens),0)::bigint AS tokens, COUNT(u.*)::int AS calls
         FROM app_usage u JOIN app_user au ON au.id = u.user_id
         GROUP BY au.id, au.display_name, au.username, au.external_id
         ORDER BY tokens DESC LIMIT 20`,
      );

      return c.json({
        users: { total: users.total, bound: users.bound, active: active.n },
        tokens: { total: n(tok.input) + n(tok.output), input: n(tok.input), output: n(tok.output), calls: tok.calls },
        today: { total: n(today.input) + n(today.output), calls: today.calls },
        byModel: byModel.map((m) => ({ model: m.model || '(未知)', tokens: n(m.tokens), calls: m.calls })),
        topUsers: topUsers.map((t) => ({
          name: t.display_name || t.username || '(匿名)',
          sid: t.external_id || '',
          tokens: n(t.tokens),
          calls: t.calls,
        })),
      });
    }),
  }),
];
