import { registerApiRoute } from '@mastra/core/server';
import { randomUUID } from 'node:crypto';
import { query } from '../db/pool';
import { ensureSchema } from '../db/schema';
import { hashPassword } from '../auth/password';
import { issueSession, clearSession } from '../auth/session';
import { localProvider } from '../auth/provider';
import { getUserById, publicUser } from '../auth/user';
import { authed } from '../auth/guard';
import { rateLimit, clientIp } from '../auth/ratelimit';

export const authRoutes = [
  registerApiRoute('/app/auth/register', {
    method: 'POST',
    handler: async (c) => {
      await ensureSchema();
      // 防注册轰炸：同一 IP 10 分钟内最多 5 次
      if (!rateLimit(`register:${clientIp(c)}`, 5, 10 * 60_000)) {
        return c.json({ error: '注册过于频繁，请稍后再试' }, 429);
      }
      let body: any;
      try { body = await c.req.json(); } catch { return c.json({ error: '请求体需为 JSON' }, 400); }
      const username = String(body?.username || '').trim();
      const password = String(body?.password || '');
      const displayName = (String(body?.displayName || '').trim() || username);
      if (username.length < 2) return c.json({ error: '用户名至少 2 个字符' }, 400);
      if (password.length < 8) return c.json({ error: '密码至少 8 位' }, 400);

      const dup = await query('SELECT 1 FROM app_user WHERE lower(username) = lower($1)', [username]);
      if (dup.length) return c.json({ error: '用户名已被占用' }, 409);

      const id = randomUUID();
      await query(
        `INSERT INTO app_user (id, username, password_hash, display_name, avatar_seed, auth_provider)
         VALUES ($1, $2, $3, $4, $5, 'local')`,
        [id, username, hashPassword(password), displayName, displayName.slice(0, 1).toUpperCase()],
      );
      issueSession(c, id);
      const u = await getUserById(id);
      return c.json({ user: u ? publicUser(u) : null });
    },
  }),

  registerApiRoute('/app/auth/login', {
    method: 'POST',
    handler: async (c) => {
      await ensureSchema();
      // 防暴力枚举：同一 IP 1 分钟内最多 10 次
      if (!rateLimit(`login:${clientIp(c)}`, 10, 60_000)) {
        return c.json({ error: '尝试过于频繁，请稍后再试' }, 429);
      }
      let body: any;
      try { body = await c.req.json(); } catch { return c.json({ error: '请求体需为 JSON' }, 400); }
      const res = await localProvider.authenticate(c, body);
      if (!res) return c.json({ error: '用户名或密码错误' }, 401);
      issueSession(c, res.userId);
      const u = await getUserById(res.userId);
      return c.json({ user: u ? publicUser(u) : null });
    },
  }),

  registerApiRoute('/app/auth/logout', {
    method: 'POST',
    handler: async (c) => { clearSession(c); return c.json({ ok: true }); },
  }),

  registerApiRoute('/app/auth/me', {
    method: 'GET',
    handler: authed(async (c, u) => c.json({ user: publicUser(u) })),
  }),

  // SSO 接缝占位（详见 auth/provider.ts 的 TODO(sso)）
  registerApiRoute('/app/auth/sso/callback', {
    method: 'GET',
    handler: async (c) => c.json({ error: 'SSO 未启用（预留接口）' }, 501),
  }),
];
