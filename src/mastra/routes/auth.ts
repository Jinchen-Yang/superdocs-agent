import { registerApiRoute } from '@mastra/core/server';
import { ensureSchema } from '../db/schema';
import { issueSession, clearSession, readSession } from '../auth/session';
import { buptSsoVerify, findOrCreateSsoUser, localVerify, migrateLocalToSso } from '../auth/provider';
import { verifyEmbedToken } from '../auth/embed';
import { getUserById, publicUser, bumpSessionEpoch } from '../auth/user';
import { authed } from '../auth/guard';
import { rateLimit, clearRateLimit, clientIp } from '../auth/ratelimit';
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
  // 注册已关闭：一律走北邮统一认证(SSO)。保留端点，给可能缓存旧前端的用户一个明确提示。
  registerApiRoute('/app/auth/register', {
    method: 'POST',
    handler: async (c) => c.json({ error: '注册已关闭，请使用「北邮统一认证」登录' }, 410),
  }),

  // 迁移/合并：把改版前的本地账号并入统一认证账号（旧用户名/密码 + 学号/统一认证密码，两边都验证）。
  registerApiRoute('/app/auth/merge', {
    method: 'POST',
    handler: async (c) => {
      await ensureSchema();
      if (!rateLimit(`merge:${clientIp(c)}`, 5, 10 * 60_000)) {
        return c.json({ error: '操作过于频繁，请稍后再试' }, 429);
      }
      let body: any;
      try { body = await c.req.json(); } catch { return c.json({ error: '请求体需为 JSON' }, 400); }
      const oldUsername = String(body?.oldUsername || '').trim();
      const oldPassword = String(body?.oldPassword || '');
      const studentId = String(body?.studentId || '').trim();
      const ssoPassword = String(body?.ssoPassword || '');
      if (!oldUsername || !oldPassword) return c.json({ error: '请填写旧账号的用户名和密码' }, 400);
      if (!studentId || !ssoPassword) return c.json({ error: '请填写学号和统一认证密码' }, 400);
      // 账号维度限流：防 IP 轮换下针对单个学号反复试统一认证密码。
      if (!rateLimit(`merge-acct:${studentId}`, 5, 10 * 60_000)) {
        return c.json({ error: '该学号尝试过于频繁，请稍后再试' }, 429);
      }
      let identity: { studentId: string; realName: string };
      try {
        identity = await buptSsoVerify(studentId, ssoPassword);
      } catch (e: any) {
        return c.json({ error: ssoErrMsg(e) }, 401);
      }
      let r: { userId: string } | { error: string };
      try {
        r = await migrateLocalToSso(oldUsername, oldPassword, identity.studentId, identity.realName);
      } catch (e: any) {
        // 极端并发下唯一索引冲突(23505)等 → 让用户重试，而非裸 500。
        return c.json({ error: '操作冲突，请稍后重试' }, 409);
      }
      if ('error' in r) return c.json({ error: r.error }, 409);
      const u = await getUserById(r.userId);
      if (!u) return c.json({ error: '合并异常，请重试' }, 500);
      clearRateLimit(`merge-acct:${studentId}`);
      issueSession(c, u.id, u.session_epoch);
      return c.json({ user: publicUser(u) });
    },
  }),

  // 本地密码登录（仅已绑定学号且设了密码的账号可用；保留作为已迁移用户的备用入口，前端不再主推）。
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
      // 账号维度限流：防分布式/换 IP 撞单个账号的库。
      if (username && !rateLimit(`login-acct:${username.toLowerCase()}`, 10, 5 * 60_000)) {
        return c.json({ error: '该账号尝试过于频繁，请稍后再试' }, 429);
      }
      const id = await localVerify(username, password);
      if (!id) return c.json({ error: '用户名或密码错误（或该账号尚未绑定统一认证）' }, 401);
      const u = await getUserById(id);
      if (!u) return c.json({ error: '登录异常，请重试' }, 500);
      // 登录成功即清账号桶，避免合法用户被自己之前的输错次数拖累。
      clearRateLimit(`login-acct:${username.toLowerCase()}`);
      issueSession(c, u.id, u.session_epoch);
      return c.json({ user: publicUser(u) });
    },
  }),

  // 北邮统一认证登录（学号 + 密码）—— 主登录方式。
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
      if (!rateLimit(`sso-acct:${studentId}`, 10, 5 * 60_000)) {
        return c.json({ error: '该学号尝试过于频繁，请稍后再试' }, 429);
      }
      try {
        const identity = await buptSsoVerify(studentId, password);
        const id = await findOrCreateSsoUser(identity.studentId, identity.realName);
        const u = await getUserById(id);
        if (!u) return c.json({ error: '登录异常，请重试' }, 500);
        clearRateLimit(`sso-acct:${studentId}`);
        issueSession(c, u.id, u.session_epoch);
        return c.json({ user: publicUser(u) });
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
      const u = await getUserById(userId);
      if (!u) return c.json({ error: '登录异常，请重试' }, 500);
      issueSession(c, u.id, u.session_epoch);
      return c.json({ user: publicUser(u) });
    },
  }),

  // 登出：吊销纪元(让此前所有 token 失效) + 清 cookie。两步独立，纪元失败也仍清 cookie。
  registerApiRoute('/app/auth/logout', {
    method: 'POST',
    handler: async (c) => {
      // CSRF 兜底：登出会吊销该用户「全部设备」的会话(纪元+1)，要求 application/json——
      // 跨站表单无法设此 content-type，跨站 fetch 设它会触发被拦的 CORS 预检，从而挡住"跨站强制登出"。
      const ct = c.req.header('content-type') || '';
      if (!ct.includes('application/json')) return c.json({ error: '请求需为 application/json' }, 415);
      const s = readSession(c);
      if (s) await bumpSessionEpoch(s.userId).catch(() => {});
      clearSession(c);
      return c.json({ ok: true });
    },
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
