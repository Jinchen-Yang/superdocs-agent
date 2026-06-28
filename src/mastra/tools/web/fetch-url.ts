import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';

// fetch_url —— 取「某个具体链接/官网页面」的正文,作为 web_search 的「读」配套。
// 安全第一:本工具在云服务器上运行,模型可控制 url,故必须严防 SSRF
// (被诱导去读内网 / 回环 / 云元数据 169.254.169.254 等)。防线:
//   scheme/端口/userinfo 白名单 → 元数据主机名黑名单 → 解析出「真实 IP」逐个校验
//   → 把连接「钉」在已校验 IP 上(闭合 DNS rebinding 的 TOCTOU)→ 逐跳复验跳转。
// 省 token:正文 HTML→纯文本后硬截断 ~4000 字,且网络层限字节、限时(单跳+总预算)。

const MAX_TEXT = 4000; // 返回给模型的正文字符上限
const MAX_BYTES = 3_000_000; // 网络层读取字节上限(防大文件撑爆内存)
const MAX_DECOMPRESSED = 8_000_000; // 解压输出上限(防 gzip/br 压缩炸弹)
const HOP_TIMEOUT_MS = 8000; // 单跳连接+空闲超时
const OVERALL_MS = 15000; // 含全部跳转的总时间预算
const MAX_REDIRECTS = 4; // 最多跟随的跳转次数(→ 最多 5 次请求)
const ALLOWED_PORTS = new Set(['', '80', '443']); // 仅默认端口 / 80 / 443
const BLOCKED_HOSTS = new Set([
  'metadata.tencentyun.com', // 腾讯云元数据(→169.254.0.23 / 169.254.10.10)
  'metadata.google.internal', // GCP 元数据(→169.254.169.254)
]);

// ───────────────────────── IP 黑名单(按解析出的真实 IP 判定) ─────────────────────────

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

// 私有 / 回环 / 链路本地 / CGNAT / 保留 / 云元数据 等不可对外 fetch 的 v4 段
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // 当前网络 / 未指定
  ['10.0.0.0', 8], // 私有
  ['100.64.0.0', 10], // CGNAT(覆盖阿里云元数据 100.100.100.200、Tailscale 100.x)
  ['127.0.0.0', 8], // 回环
  ['169.254.0.0', 16], // 链路本地(覆盖 169.254.169.254 元数据、腾讯云 169.254.0.23/10.10)
  ['172.16.0.0', 12], // 私有
  ['192.0.0.0', 24], // IETF 协议分配
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 中继 anycast
  ['192.168.0.0', 16], // 私有
  ['198.18.0.0', 15], // 基准测试(Mac mihomo fake-ip 也在此段)
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // 组播
  ['240.0.0.0', 4], // 保留(含 255.255.255.255 广播)
];

function blockedV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // 解析不了的当作不安全
  for (const [base, bits] of BLOCKED_V4) {
    const b = ipv4ToInt(base)!;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((n & mask) === (b & mask)) return true;
  }
  return false;
}

// 把 IPv6 字面量展开成 16 字节;支持 :: 压缩与内嵌 IPv4
function ipv6ToBytes(ip: string): Uint8Array | null {
  let s = ip;
  const zone = s.indexOf('%'); // 去掉 scope id(fe80::1%eth0)
  if (zone !== -1) s = s.slice(0, zone);
  const lastColon = s.lastIndexOf(':');
  const tail = s.slice(lastColon + 1);
  if (tail.includes('.')) {
    // 内嵌 IPv4,转成两组 16-bit 后再统一解析
    const v4 = ipv4ToInt(tail);
    if (v4 === null) return null;
    const hi = ((v4 >>> 16) & 0xffff).toString(16);
    const lo = (v4 & 0xffff).toString(16);
    s = s.slice(0, lastColon + 1) + hi + ':' + lo;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const back = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : null;
  let groups: string[];
  if (back === null) {
    if (head.length !== 8) return null;
    groups = head;
  } else {
    const missing = 8 - head.length - back.length;
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill('0'), ...back];
  }
  if (groups.length !== 8) return null;
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(groups[i])) return null;
    const v = parseInt(groups[i], 16);
    bytes[i * 2] = (v >>> 8) & 255;
    bytes[i * 2 + 1] = v & 255;
  }
  return bytes;
}

function blockedV6(ip: string): boolean {
  const b = ipv6ToBytes(ip);
  if (!b) return true; // 解析不了的当作不安全
  if (b.every((x, i) => (i === 15 ? x === 1 : x === 0))) return true; // ::1 回环
  if (b.every((x) => x === 0)) return true; // :: 未指定
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // fe80::/10 链路本地
  if ((b[0] & 0xfe) === 0xfc) return true; // fc00::/7 ULA
  if (b[0] === 0xff) return true; // ff00::/8 组播
  // IPv4-mapped ::ffff:a.b.c.d → 取内嵌 v4 复用 v4 规则
  const mapped = b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff;
  // IPv4-compatible ::a.b.c.d(已废弃,前 12 字节全 0)
  const compat = b.slice(0, 12).every((x) => x === 0);
  // NAT64 64:ff9b::/96
  const nat64 =
    b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b.slice(4, 12).every((x) => x === 0);
  if (mapped || compat || nat64) {
    return blockedV4(`${b[12]}.${b[13]}.${b[14]}.${b[15]}`);
  }
  // 6to4 2002::/16 内嵌 v4(字节 2..5)
  if (b[0] === 0x20 && b[1] === 0x02) {
    return blockedV4(`${b[2]}.${b[3]}.${b[4]}.${b[5]}`);
  }
  return false;
}

// 导出供单元测试(纯函数,无网络):IP 是否落入受限范围
export function blockedIp(ip: string): boolean {
  const fam = net.isIP(ip);
  if (fam === 4) return blockedV4(ip);
  if (fam === 6) return blockedV6(ip);
  return true; // 非法 IP 字符串 → 不安全
}

// ───────────────────────── 解析并「钉住」安全 IP(闭合 TOCTOU) ─────────────────────────

interface PinnedAddr {
  address: string;
  family: number;
}

// 解析 host 的所有地址,任一命中黑名单即整体拒绝;返回已校验地址用于钉连接。
async function resolveSafe(rawHost: string): Promise<PinnedAddr[]> {
  const hostname = rawHost.replace(/^\[|\]$/g, ''); // 去掉 IPv6 字面量方括号(URL.hostname 会带 [ ])
  const literal = net.isIP(hostname);
  let addrs: PinnedAddr[];
  if (literal) {
    addrs = [{ address: hostname, family: literal }];
  } else {
    const looked = await dns.lookup(hostname, { all: true, verbatim: true });
    addrs = looked.map((a) => ({ address: a.address, family: a.family }));
  }
  if (addrs.length === 0) throw new Error(`无法解析主机 ${hostname}`);
  for (const a of addrs) {
    if (blockedIp(a.address)) {
      throw new Error(`目标地址 ${a.address}(${hostname})属内网/回环/元数据等受限范围,已拒绝`);
    }
  }
  return addrs;
}

// 用已校验地址构造 lookup,使底层连接只连到这些 IP —— 不再二次解析,杜绝 rebinding。
function pinnedLookup(addrs: PinnedAddr[]) {
  return (
    _hostname: string,
    options: { all?: boolean } | ((err: Error | null, addr?: any, fam?: number) => void),
    callback?: (err: Error | null, addr?: any, fam?: number) => void,
  ) => {
    const cb = (typeof options === 'function' ? options : callback)!;
    const opts = typeof options === 'function' ? {} : options;
    if (opts.all) {
      cb(null, addrs.map((a) => ({ address: a.address, family: a.family })) as any);
    } else {
      cb(null, addrs[0].address, addrs[0].family);
    }
  };
}

// ───────────────────────── URL 校验 ─────────────────────────

// 导出供单元测试(纯函数,无网络):scheme/端口/userinfo/元数据主机名 白名单校验
export function validateUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`非法 URL:${raw}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`仅支持 http/https,拒绝 ${u.protocol}`);
  }
  if (u.username || u.password) {
    throw new Error('URL 不得带用户名/密码(userinfo)');
  }
  if (!ALLOWED_PORTS.has(u.port)) {
    throw new Error(`仅允许默认端口/80/443,拒绝端口 ${u.port}`);
  }
  if (BLOCKED_HOSTS.has(u.hostname.toLowerCase())) {
    throw new Error(`拒绝访问元数据服务主机 ${u.hostname}`);
  }
  return u;
}

// ───────────────────────── 单跳请求(限时/限字节) ─────────────────────────

interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

function requestOnce(u: URL, addrs: PinnedAddr[], signal: AbortSignal): Promise<RawResponse> {
  const isHttps = u.protocol === 'https:';
  const lib = isHttps ? https : http;
  return new Promise<RawResponse>((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (isHttps ? 443 : 80),
        path: u.pathname + u.search,
        method: 'GET',
        servername: isHttps && net.isIP(u.hostname.replace(/^\[|\]$/g, '')) === 0 ? u.hostname : undefined,
        lookup: pinnedLookup(addrs) as any,
        timeout: HOP_TIMEOUT_MS,
        signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; superdocs-agent/1.0; +https://byrdocs.cloudlay.cn)',
          Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,text/plain;q=0.8,*/*;q=0.5',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        const finish = () =>
          done(() => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on('data', (c: Buffer) => {
          if (settled) return;
          total += c.length;
          if (total > MAX_BYTES) {
            res.destroy();
            req.destroy();
            finish(); // 用已收到的部分(截断),而非整体失败
            return;
          }
          chunks.push(c);
        });
        res.on('end', finish);
        res.on('error', (e) => done(() => reject(e)));
      },
    );
    req.on('timeout', () => req.destroy(new Error(`请求超时(${HOP_TIMEOUT_MS}ms)`)));
    req.on('error', (e) => done(() => reject(e)));
    req.end();
  });
}

function decompress(body: Buffer, encoding?: string): Buffer {
  // maxOutputLength 防「压缩炸弹」:3MB 压缩体可膨胀到 GB 级,必须给解压输出封顶。
  const opts = { maxOutputLength: MAX_DECOMPRESSED };
  try {
    switch ((encoding || '').toLowerCase()) {
      case 'gzip':
        return zlib.gunzipSync(body, opts);
      case 'deflate':
        return zlib.inflateSync(body, opts);
      case 'br':
        return zlib.brotliDecompressSync(body, opts);
      default:
        return body;
    }
  } catch {
    // 解压失败(含超过 maxOutputLength 抛错):退回原始字节的截断,绝不返回炸弹展开物
    return body.subarray(0, MAX_DECOMPRESSED);
  }
}

// ───────────────────────── HTML → 纯文本 ─────────────────────────

function safeFromCode(n: number): string {
  try {
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  } catch {
    return '';
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => safeFromCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeFromCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&'); // 最后再解 &,避免二次解码
}

// 按 Content-Type / <meta charset> 选编码解码(很多北邮/政府页面是 GBK/GB18030)
function pickCharset(ctype: string, head: string): string {
  const m = ctype.match(/charset=["']?([\w-]+)/i);
  if (m) return m[1].toLowerCase();
  const m2 = head.match(/<meta[^>]+charset=["']?([\w-]+)/i);
  if (m2) return m2[1].toLowerCase();
  return 'utf-8';
}

function decodeBody(buf: Buffer, ctype: string): string {
  const head = buf.subarray(0, 2048).toString('latin1'); // meta charset 声明都是 ASCII,latin1 足够定位
  let cs = pickCharset(ctype, head);
  if (cs === 'utf8') cs = 'utf-8';
  if (cs === 'utf-8' || cs === 'ascii' || cs === 'us-ascii') return buf.toString('utf8');
  try {
    return new TextDecoder(cs).decode(buf); // gbk/gb2312/gb18030/big5 等(Node 22 full-ICU)
  } catch {
    return buf.toString('utf8');
  }
}

function htmlToText(html: string): { title?: string; text: string } {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : undefined;
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer|ul|ol|table|blockquote)\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, text: s };
}

// ───────────────────────── 工具定义 ─────────────────────────

export const fetchUrl = createTool({
  id: 'fetch_url',
  description:
    '抓取某个【具体网址】的正文(http/https)。用于读取 web_search 给出的某条链接、或用户/文档里出现的官网页面/文件的内容。' +
    '返回标题与提取后的纯文本(已截断)。只接受公开网址;内网/回环/本机地址会被安全策略拒绝。',
  inputSchema: z.object({
    url: z.string().describe('要抓取的完整网址,必须以 http:// 或 https:// 开头'),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    url: z.string().describe('最终网址(跟随跳转后)'),
    status: z.number().optional(),
    contentType: z.string().optional(),
    title: z.string().optional(),
    text: z.string(),
    truncated: z.boolean(),
    error: z.string().optional(),
  }),
  execute: async ({ url }) => {
    const controller = new AbortController();
    const killer = setTimeout(() => controller.abort(), OVERALL_MS);
    try {
      let current = validateUrl(url);
      let resp: RawResponse | null = null;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const addrs = await resolveSafe(current.hostname); // 逐跳解析+校验
        resp = await requestOnce(current, addrs, controller.signal);
        const loc = resp.headers.location;
        if (loc && [301, 302, 303, 307, 308].includes(resp.status)) {
          if (hop === MAX_REDIRECTS) throw new Error('跳转次数过多');
          current = validateUrl(new URL(loc, current).toString()); // 复验下一跳
          continue;
        }
        break;
      }
      if (!resp) throw new Error('无响应');

      const ctype = String(resp.headers['content-type'] || '');
      const decoded = decompress(resp.body, resp.headers['content-encoding']);

      const isText = /text\/|application\/(json|xml|xhtml|.*\+xml|javascript)/i.test(ctype) || ctype === '';
      if (!isText) {
        return {
          ok: true,
          url: current.toString(),
          status: resp.status,
          contentType: ctype || undefined,
          text: '',
          truncated: false,
          error: `非文本内容(${ctype || '未知类型'}),不提取正文。如是可下载文件请直接给出链接。`,
        };
      }

      const raw = decodeBody(decoded, ctype);
      const isHtml = /html|xml/i.test(ctype) || /^\s*<(!doctype|html)/i.test(raw);
      const { title, text } = isHtml ? htmlToText(raw) : { title: undefined, text: raw.trim() };
      const truncated = text.length > MAX_TEXT;
      return {
        ok: true,
        url: current.toString(),
        status: resp.status,
        contentType: ctype || undefined,
        title: title || undefined,
        text: truncated ? text.slice(0, MAX_TEXT) + '…（正文较长已截断）' : text,
        truncated,
      };
    } catch (e: any) {
      const aborted = controller.signal.aborted;
      return {
        ok: false,
        url,
        text: '',
        truncated: false,
        error: aborted ? `抓取超时(总预算 ${OVERALL_MS}ms)` : e?.message ? String(e.message) : '抓取失败',
      };
    } finally {
      clearTimeout(killer);
    }
  },
});
