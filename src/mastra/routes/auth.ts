import { registerApiRoute } from '@mastra/core/server';
import { ensureSchema } from '../db/schema';
import { issueSession, clearSession } from '../auth/session';
import { buptSsoVerify, findOrCreateSsoUser, localVerify, bindLocalCredentials } from '../auth/provider';
import { verifyEmbedToken } from '../auth/embed';
import { getUserById, publicUser } from '../auth/user';
import { authed } from '../auth/guard';
import { rateLimit, clientIp } from '../auth/ratelimit';
import { campus } from '../auth/campus';

// 把 SSO 异常映射为用户可读提示。
const ssoErrMsg = (e: any): string => {
  const name = e?.name;
  if (name === 'OCRError') return '验证码识别失败，请重试';
  if (name === 'LoginError') return '学号或统一认证密码错误';
  if (/需要验证码/.test(e?.message || '')) return '当前登录需要验证码，请稍后重试';
  return '统一认证失败：' + (e?.message || e);
};

export const authRoutes = [
  // 注册 = 把本地用户名/密码绑定到北邮统一认证（需 学号 + 统一认证密码 验证身份）。
  registerApiRoute('/app/auth/register', {
    method: 'POST',
    handler: async (c) => {
      await ensureSchema();
      if (!rateLimit(`register:${clientIp(c)}`, 5, 10 * 60_000)) {
        return c.json({ error: '注册过于频繁，请稍后再试' }, 429);
      }
      let body: any;
      try { body = await c.req.json(); } catch { return c.json({ error: '请求体需为 JSON' }, 400); }
      const username = String(body?.username || '').trim();
      const password = String(body?.password || '');
      const studentId = String(body?.studentId || '').trim();
      const ssoPassword = String(body?.ssoPassword || '');
      if (username.length < 2) return c.json({ error: '用户名至少 2 个字符' }, 400);
      if (password.length < 8) return c.json({ error: '本地密码至少 8 位' }, 400);
      if (!studentId || !ssoPassword) return c.json({ error: '请填写学号和统一认证密码以绑定' }, 400);

      let identity: { studentId: string; realName: string };
      try {
        identity = await buptSsoVerify(studentId, ssoPassword);
      } catch (e: any) {
        return c.json({ error: ssoErrMsg(e) }, 401);
      }
      const r = await bindLocalCredentials(identity.studentId, identity.realName, username, password);
      if ('error' in r) return c.json({ error: r.error }, 409);
      issueSession(c, r.userId);
      const u = await getUserById(r.userId);
      return c.json({ user: u ? publicUser(u) : null });
    },
  }),

  // 本地密码登录（仅已绑定学号的账号可用）。
  registerApiRoute('/app/auth/login', {
    method: 'POST',
    handler: async (c) => {
      await ensureSchema();
      if (!rateLimit(`login:${clientIp(c)}`, 10, 60_000)) {
        return c.json({ error: '尝试过于频繁，请稍后再试' }, 429);
      }
      let body: any;
      try { body = await c.req.json(); } catch { return c.json({ error: '请求体需为 JSON' }, 400); }
      const username = String(body?.username || '').trim();
      const password = String(body?.password || '');
      const id = await localVerify(username, password);
      if (!id) return c.json({ error: '用户名或密码错误（或该账号尚未绑定统一认证）' }, 401);
      issueSession(c, id);
      const u = await getUserById(id);
      return c.json({ user: u ? publicUser(u) : null });
    },
  }),

  // 北邮统一认证登录（学号 + 密码）。
  registerApiRoute('/app/auth/sso', {
    method: 'POST',
    handler: async (c) => {
      await ensureSchema();
      if (!rateLimit(`sso:${clientIp(c)}`, 10, 60_000)) {
        return c.json({ error: '尝试过于频繁，请稍后再试' }, 429);
      }
      let body: any;
      try { body = await c.req.json(); } catch { return c.json({ error: '请求体需为 JSON' }, 400); }
      const studentId = String(body?.studentId || '').trim();
      const password = String(body?.password || '');
      if (!studentId || !password) return c.json({ error: '请填写学号和密码' }, 400);
      try {
        const identity = await buptSsoVerify(studentId, password);
        const id = await findOrCreateSsoUser(identity.studentId, identity.realName);
        issueSession(c, id);
        const u = await getUserById(id);
        return c.json({ user: u ? publicUser(u) : null });
      } catch (e: any) {
        return c.json({ error: ssoErrMsg(e) }, 401);
      }
    },
  }),

  // 内嵌单点登录：宿主站签发的 token 换取本服务会话（方案 A，需配 EMBED_JWT_SECRET）。
  registerApiRoute('/app/auth/embed', {
    method: 'POST',
    handler: async (c) => {
      await ensureSchema();
      if (!rateLimit(`embed:${clientIp(c)}`, 20, 60_000)) return c.json({ error: '尝试过于频繁，请稍后再试' }, 429);
      let body: any;
      try { body = await c.req.json(); } catch { return c.json({ error: '请求体需为 JSON' }, 400); }
      const id = verifyEmbedToken(String(body?.token || ''));
      if (!id) return c.json({ error: '内嵌令牌无效或未启用' }, 401);
      const userId = await findOrCreateSsoUser(id.studentId, id.realName);
      issueSession(c, userId);
      const u = await getUserById(userId);
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

  // 公开：返回当前客户端 IP 与门禁判定，便于配置 CAMPUS_CIDRS。
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
