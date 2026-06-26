// 极简内存滑动窗口限流：防登录/注册被暴力枚举。
// 单进程内有效；将来多实例部署需换成 Redis 等共享存储。
const hits = new Map<string, number[]>();

// 返回 true=放行，false=超限。key 一般用 `动作:IP`。
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  // 软上限：键过多时整体清空，避免内存无界增长（极端场景的兜底）。
  if (hits.size > 10_000) hits.clear();
  return true;
}

// 从反代头里取客户端 IP（nginx 需透传 X-Forwarded-For / X-Real-IP）。
export function clientIp(c: any): string {
  const xff = c.req.header('x-forwarded-for');
  if (xff) return String(xff).split(',')[0].trim();
  return c.req.header('x-real-ip') || 'unknown';
}
