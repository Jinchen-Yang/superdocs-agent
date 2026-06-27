import { describe, it, expect, vi } from 'vitest';
import { issueSession, readSession } from '../mastra/auth/session';
import { rateLimit, clearRateLimit, clientIp } from '../mastra/auth/ratelimit';
import { isCampusIp } from '../mastra/auth/campus';
import { isAdmin } from '../mastra/auth/admin';
import { hashPassword, verifyPassword } from '../mastra/auth/password';
import { withDeadline, withTimeout } from '../mastra/util/fetch';
import type { AppUser } from '../mastra/auth/user';

// 测试用的极简 Hono ctx 替身。
const ctxOut = () => {
  const headers: string[] = [];
  return { headers, c: { header: (_k: string, v: string) => headers.push(v) } as any };
};
const ctxIn = (h: Record<string, string>) => ({
  req: { header: (k: string) => h[k.toLowerCase()] },
}) as any;
const admin = (u: Partial<AppUser>) => u as AppUser;

describe('会话 token（P0-4 可吊销）', () => {
  it('合法 token 往返解出 userId + epoch', () => {
    const { headers, c } = ctxOut();
    issueSession(c, 'user-1', 7);
    const cookie = headers[0].split(';')[0];
    const s = readSession(ctxIn({ cookie }));
    expect(s).toEqual({ userId: 'user-1', epoch: 7 });
  });

  it('篡改签名 → null', () => {
    const { headers, c } = ctxOut();
    issueSession(c, 'user-1', 1);
    const cookie = headers[0].split(';')[0] + 'x';
    expect(readSession(ctxIn({ cookie }))).toBeNull();
  });

  it('旧 3 段 token → null（升级即失效，符合预期）', () => {
    expect(readSession(ctxIn({ cookie: 'sd_session=user-1.123.deadbeef' }))).toBeNull();
  });

  it('无会话 cookie → null', () => {
    expect(readSession(ctxIn({ cookie: 'other=x' }))).toBeNull();
    expect(readSession(ctxIn({}))).toBeNull();
  });
});

describe('限流（P0-6）', () => {
  it('超过 max 即拦截', () => {
    const key = 'test-block:1.2.3.4';
    let allowed = 0;
    for (let i = 0; i < 5; i++) if (rateLimit(key, 3, 60_000)) allowed++;
    expect(allowed).toBe(3);
  });

  it('clearRateLimit 重置计数', () => {
    const key = 'test-clear:5.6.7.8';
    for (let i = 0; i < 3; i++) rateLimit(key, 3, 60_000);
    expect(rateLimit(key, 3, 60_000)).toBe(false);
    clearRateLimit(key);
    expect(rateLimit(key, 3, 60_000)).toBe(true);
  });

  it('过期窗口外的旧记录不计数', () => {
    const key = 'test-window:9.9.9.9';
    expect(rateLimit(key, 1, 1)).toBe(true); // 窗口 1ms
    const t0 = Date.now();
    while (Date.now() - t0 < 5) { /* 自旋 5ms 让窗口过期 */ }
    expect(rateLimit(key, 1, 1)).toBe(true); // 旧记录已过期，仍放行
  });
});

describe('clientIp（P0-1 不信任可伪造 XFF）', () => {
  it('默认 hops=0：忽略 XFF，只认 X-Real-IP', () => {
    expect(clientIp(ctxIn({ 'x-forwarded-for': '6.6.6.6', 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
  });

  it('默认 hops=0：仅有 XFF（无 X-Real-IP）→ unknown，杜绝伪造', () => {
    expect(clientIp(ctxIn({ 'x-forwarded-for': '6.6.6.6' }))).toBe('unknown');
    expect(clientIp(ctxIn({}))).toBe('unknown');
  });

  it('TRUSTED_PROXY_HOPS=2：取 XFF 从右数第 2 个（真实客户端）', async () => {
    vi.resetModules();
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2');
    const { clientIp: cip } = await import('../mastra/auth/ratelimit');
    expect(cip(ctxIn({ 'x-forwarded-for': 'evil, real-client, nginx-edge' }))).toBe('real-client');
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe('校园门禁 CIDR（P0-1 连带）', () => {
  it('命中/未命中/unknown 判定', () => {
    expect(isCampusIp('211.68.1.23')).toBe(true);
    expect(isCampusIp('8.8.8.8')).toBe(false);
    expect(isCampusIp('unknown')).toBe(false);
    expect(isCampusIp('::ffff:211.68.1.23')).toBe(true); // IPv4-mapped IPv6
  });
});

describe('管理员判定（P0-5 仅认学号）', () => {
  it('学号(external_id)匹配 → 管理员', () => {
    expect(isAdmin(admin({ external_id: '2021211000', username: 'whatever' }))).toBe(true);
  });

  it('用户名=ADMIN_IDS 但学号不符 → 非管理员（堵死提权）', () => {
    expect(isAdmin(admin({ external_id: 'someone-else', username: '2021211000' }))).toBe(false);
    expect(isAdmin(admin({ external_id: null, username: '2021211000' }))).toBe(false);
  });
});

describe('密码散列', () => {
  it('对/错/畸形存储串', () => {
    const h = hashPassword('correct horse battery');
    expect(verifyPassword('correct horse battery', h)).toBe(true);
    expect(verifyPassword('wrong', h)).toBe(false);
    expect(verifyPassword('x', 'garbage')).toBe(false);
  });
});

describe('超时工具（稳定性）', () => {
  it('withDeadline 快路径正常返回', async () => {
    await expect(withDeadline(Promise.resolve('done'), 1000, '测试')).resolves.toBe('done');
  });

  it('withDeadline 超时抛错', async () => {
    const slow = new Promise((r) => setTimeout(() => r('late'), 200));
    await expect(withDeadline(slow, 30, '测试')).rejects.toThrow(/超时/);
  });

  it('withTimeout 返回 fetch 包装函数', () => {
    expect(typeof withTimeout(1000)).toBe('function');
  });
});
