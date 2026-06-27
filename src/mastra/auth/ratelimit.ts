import { log } from '../util/log';

// 内存滑动窗口限流：防登录/注册被暴力枚举。
// 单进程内有效；多实例部署需换成 Redis 等共享存储（见文末说明）。
const hits = new Map<string, number[]>();
// 键数量上限：超出时按「最久未活跃」淘汰，绝不整体清空。
const MAX_KEYS = 50_000;

// 返回 true=放行，false=超限。key 一般用 `动作:IP` 或 `动作:账号`。
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  // 先删后插：让该 key 移到 Map 队尾，使插入顺序≈最近活跃顺序（便于 LRU 淘汰）。
  hits.delete(key);
  const allowed = arr.length < max;
  if (allowed) arr.push(now);
  if (arr.length) hits.set(key, arr);

  // 内存兜底：超量时从队首（最久未活跃）淘汰固定批量。
  // 不再用 `hits.clear()` —— 否则攻击者用伪造 key 灌满即可触发「全量重置撞库计数」。
  // 正在被暴力攻击的 key 因持续活跃会留在队尾，不会被这里误删。
  if (hits.size > MAX_KEYS) {
    const evict: string[] = [];
    for (const k of hits.keys()) {
      evict.push(k);
      if (evict.length >= hits.size - MAX_KEYS) break;
    }
    for (const k of evict) hits.delete(k);
  }
  return allowed;
}

// 清掉某个 key 的计数（如登录成功后清账号桶，避免合法用户被自己早先的输错次数拖累）。
export function clearRateLimit(key: string): void {
  hits.delete(key);
}

// ── 客户端真实 IP 解析 ────────────────────────────────────────────────
// 安全前提：X-Forwarded-For 整体是「客户端可伪造」的——攻击者能任意构造左侧条目，
// 据此判校园门禁/限流 key 都会被绕过。只有最右侧若干条目是「我们自己的反代」追加的可信值。
//
// 部署约定（务必满足，否则 IP 判定不可信）：
//   1) 应用只通过反代访问，绝不把应用端口直接暴露公网（本项目经反向 SSH 隧道仅监听 localhost，满足）。
//   2) nginx 设置：proxy_set_header X-Real-IP $remote_addr;  （$remote_addr 会覆盖客户端伪造的同名头）
//      并按需 proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
//
// TRUSTED_PROXY_HOPS = 应用与客户端之间「我们掌控的反代层数」(nginx=1)。
//   >0：真实 IP = X-Forwarded-For 从右数第 N 个条目（最可靠）。
//   =0（默认）：忽略 XFF，只认反代写入的 X-Real-IP。误配置时宁可「认不出 IP」也不被伪造绕过。
const TRUSTED_HOPS = Math.max(0, Math.trunc(Number(process.env.TRUSTED_PROXY_HOPS) || 0));
let warnedUnknown = false;

export function clientIp(c: any): string {
  if (TRUSTED_HOPS > 0) {
    const xff = c.req.header('x-forwarded-for');
    if (xff) {
      const list = String(xff).split(',').map((s) => s.trim()).filter(Boolean);
      const ip = list[list.length - TRUSTED_HOPS];
      if (ip) return ip;
    }
  }
  const real = c.req.header('x-real-ip');
  if (real) return String(real).trim();
  // 解析不出可信 IP：所有限流 key 会塌缩成 `动作:unknown` 共享一个桶、校园门禁也会全员判非校园网。
  // 告警一次，让「反代没透传 X-Real-IP / 没设 TRUSTED_PROXY_HOPS」这类误配置尽快暴露。
  if (!warnedUnknown) {
    warnedUnknown = true;
    log.warn('clientIp 解析为 unknown：反代未提供可信客户端 IP（检查 nginx 是否 set X-Real-IP，或设 TRUSTED_PROXY_HOPS）');
  }
  return 'unknown';
}
