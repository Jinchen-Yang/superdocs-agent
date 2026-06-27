import { registerApiRoute } from '@mastra/core/server';
import { randomUUID } from 'node:crypto';
import { query } from '../db/pool';
import { ensureSchema } from '../db/schema';
import { hashPassword } from '../auth/password';
import { issueSession, clearSession } from '../auth/session';
import { localProvider, buptSsoProvider } from '../auth/provider';
import { getUserById, publicUser } from '../auth/user';
import { authed } from '../auth/guard';
import { rateLimit, clientIp } from '../auth/ratelimit';
import { campus } from '../auth/campus';

// 门禁开启且非校园网 → 本地账号路径不可用，引导走 SSO。
const blockedOffCampus = (c: any) => campus.gateOn && !campus.isFromCampus(c);
const OFF_CAMPUS_MSG = '本服务仅限校园网内或北邮成员：校外请用「北邮统一认证」登录';

export const authRoutes = [
  registerApiRoute('/app/auth/register', {
    method: 'POST',
    handler: async (c) => {
      await ensureSchema();
      if (!rateLimit(`register:${clientIp(c)}`, 5, 10 * 60_000)) {
        return c.json({ error: '注册过于频繁，请稍后再试' }, 429);
      }
      if (blockedOffCampus(c)) return c.json({ error: OFF_CAMPUS_MSG }, 403);
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
      if (!rateLimit(`login:${clientIp(c)}`, 10, 60_000)) {
        return c.json({ error: '尝试过于频繁，请稍后再试' }, 429);
      }
      if (blockedOffCampus(c)) return c.json({ error: OFF_CAMPUS_MSG }, 403);
      let body: any;
      try { body = await c.req.json(); } catch { return c.json({ error: '请求体需为 JSON' }, 400); }
      const res = await localProvider.authenticate(c, body);
      if (!res) return c.json({ error: '用户名或密码错误' }, 401);
      issueSession(c, res.userId);
      const u = await getUserById(res.userId);
      return c.json({ user: u ? publicUser(u) : null });
    },
  }),

  // 北邮统一认证登录（学号 + 密码）。成功即证明校园成员身份，可在任何网络使用。
  registerApiRoute('/app/auth/sso', {
    method: 'POST',
    handler: async (c) => {
      await ensureSchema();
      if (!rateLimit(`sso:${clientIp(c)}`, 10, 60_000)) {
        return c.json({ error: '尝试过于频繁，请稍后再试' }, 429);
      }
      let body: any;
      try { body = await c.req.json(); } catch { return c.json({ error: '请求体需为 JSON' }, 400); }
      try {
        const res = await buptSsoProvider.authenticate(c, body);
        if (!res) return c.json({ error: '请填写学号和密码' }, 400);
        issueSession(c, res.userId);
        const u = await getUserById(res.userId);
        return c.json({ user: u ? publicUser(u) : null });
      } catch (e: any) {
        const name = e?.name;
        const msg =
          name === 'OCRError' ? '登录需要验证码，请联系管理员配置 BUPT_OCR_TOKEN' :
          name === 'LoginError' ? '学号或密码错误' :
          '统一认证登录失败：' + (e?.message || e);
        return c.json({ error: msg }, 401);
      }
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

  // 公开：返回当前客户端 IP 与门禁判定，便于管理员配置 CAMPUS_CIDRS、前端提示用户走哪条登录。
  registerApiRoute('/app/auth/whoami', {
    method: 'GET',
    handler: async (c) => c.json({
      ip: clientIp(c),
      campus: campus.isFromCampus(c),
      gate: campus.gateOn,
      cidrs: campus.cidrCount,
    }),
  }),
];
