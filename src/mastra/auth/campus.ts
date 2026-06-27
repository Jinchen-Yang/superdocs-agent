import { clientIp } from './ratelimit';

// 校园网门禁：把使用范围限制在「校园网 IP 段内」或「北邮 SSO 认证过的人」。
//
// - CAMPUS_GATE=on 开启门禁（默认关，避免误配置把所有人锁在外面）。
// - CAMPUS_CIDRS=逗号分隔的校园网公网段（IPv4/IPv6），如 "211.68.0.0/16,2001:da8:215::/48"。
//   在校园网内打开本服务、看 /app/auth/whoami 返回的 ip 即可确定自己的公网段。
// 部署在 nginx 反代后，真实客户端 IP 由 X-Forwarded-For 透传（见 ratelimit.clientIp）。

const GATE_ON = process.env.CAMPUS_GATE === 'on';

type Cidr = { v6: boolean; base: bigint; bits: number };

function ipToBigInt(addr: string, v6: boolean): bigint | null {
  try {
    if (!v6) {
      const parts = addr.split('.').map(Number);
      if (parts.length !== 4 || parts.some((p) => p < 0 || p > 255 || Number.isNaN(p))) return null;
      return parts.reduce((a, p) => (a << 8n) | BigInt(p), 0n);
    }
    let full = addr;
    if (addr.includes('::')) {
      const [l, r] = addr.split('::');
      const ls = l ? l.split(':') : [];
      const rs = r ? r.split(':') : [];
      const mid = Array(Math.max(0, 8 - ls.length - rs.length)).fill('0');
      full = [...ls, ...mid, ...rs].join(':');
    }
    const groups = full.split(':');
    if (groups.length !== 8) return null;
    return groups.reduce((a, g) => (a << 16n) | BigInt(parseInt(g || '0', 16)), 0n);
  } catch {
    return null;
  }
}

const maskOf = (bits: number, total: number): bigint =>
  ((1n << BigInt(bits)) - 1n) << BigInt(total - bits);

function parseCidr(s: string): Cidr | null {
  s = s.trim();
  if (!s) return null;
  const [addr, bitsStr] = s.split('/');
  const v6 = addr.includes(':');
  const total = v6 ? 128 : 32;
  const bits = bitsStr != null ? parseInt(bitsStr, 10) : total;
  const ip = ipToBigInt(addr, v6);
  if (ip == null || Number.isNaN(bits) || bits < 0 || bits > total) return null;
  return { v6, base: ip & maskOf(bits, total), bits };
}

const CIDRS: Cidr[] = (process.env.CAMPUS_CIDRS || '')
  .split(',')
  .map(parseCidr)
  .filter((c): c is Cidr => c != null);

export function isCampusIp(ip: string): boolean {
  if (!ip || ip === 'unknown') return false;
  const clean = ip.replace(/^::ffff:/i, '').split('%')[0].trim();
  const v6 = clean.includes(':');
  const val = ipToBigInt(clean, v6);
  if (val == null) return false;
  const total = v6 ? 128 : 32;
  for (const c of CIDRS) {
    if (c.v6 !== v6) continue;
    if ((val & maskOf(c.bits, total)) === c.base) return true;
  }
  return false;
}

export const campus = {
  /** 门禁是否开启 */
  gateOn: GATE_ON,
  /** 已配置的校园网段数量 */
  cidrCount: CIDRS.length,
  /** 请求是否来自校园网 IP 段 */
  isFromCampus(c: any): boolean {
    return isCampusIp(clientIp(c));
  },
};
