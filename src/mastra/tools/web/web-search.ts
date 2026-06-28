import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// web_search —— 联网兜底「搜」(博查 Web Search API)。
// 定位:本地知识库/资料库答不了(如今年最新通知、官网当前流程、校外公开信息)才用。
// 国内 CN 服务器直连可用、无需代理;返回干净的 {标题, url, 摘要}。
// 省 token:硬截断 top 5 条、每条 snippet/summary ~200 字。
// 缺 key 时「软失败」:返回空结果 + note,让 agent 如实告知而不是崩。

const ENDPOINT = 'https://api.bochaai.com/v1/web-search';
const MAX_RESULTS = 5;
const PER_FIELD = 200; // snippet / summary 每条字符上限
const TIMEOUT_MS = 10000;

const FRESHNESS = ['noLimit', 'oneDay', 'oneWeek', 'oneMonth', 'oneYear'] as const;

function trunc(s: unknown): string {
  const str = typeof s === 'string' ? s : '';
  return str.length > PER_FIELD ? str.slice(0, PER_FIELD) + '…' : str;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

export const webSearch = createTool({
  id: 'web_search',
  description:
    '联网搜索公开信息(博查)。仅当本地知识库/资料库答不了、且问题依赖「最新/校外公开信息」(如今年最新通知、官网当前流程、外部网站内容)时才用;' +
    '一次返回最多 5 条 {标题, url, 摘要}。拿到结果据此作答并在末尾标注来源 url;别为凑信息反复搜。' +
    '要读某条链接/官网某页的正文,再用 fetch_url。',
  inputSchema: z.object({
    query: z.string().min(1).describe('搜索关键词或问题,如 "北京邮电大学 2026 本科报到时间"'),
    freshness: z
      .enum(FRESHNESS)
      .optional()
      .describe('时效过滤,默认 noLimit;问"最新/今年"可用 oneMonth/oneYear'),
  }),
  outputSchema: z.object({
    count: z.number(),
    results: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string(),
        summary: z.string(),
        siteName: z.string(),
      }),
    ),
    note: z.string().optional().describe('失败/未开通等提示,供 agent 如实转告用户'),
  }),
  execute: async ({ query, freshness }) => {
    const key = process.env.BOCHA_API_KEY;
    if (!key) {
      return {
        count: 0,
        results: [],
        note: '联网搜索未开通(服务端缺少 BOCHA_API_KEY)。请改用本地知识库,或如实告知用户暂不能联网。',
      };
    }

    const controller = new AbortController();
    const killer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          count: MAX_RESULTS,
          summary: true,
          freshness: freshness ?? 'noLimit',
        }),
        signal: controller.signal,
      });

      const json: any = await res.json().catch(() => null);
      if (!res.ok || !json || json.code !== 200) {
        const code = json?.code ?? res.status;
        const msg = json?.msg ?? res.statusText;
        return { count: 0, results: [], note: `联网搜索暂时失败(${code}:${msg})。请改用本地知识库或稍后再试。` };
      }

      const value: any[] = json?.data?.webPages?.value ?? [];
      const results = value.slice(0, MAX_RESULTS).map((r) => ({
        title: typeof r?.name === 'string' ? r.name : '',
        url: (typeof r?.url === 'string' && r.url) || (typeof r?.displayUrl === 'string' ? r.displayUrl : ''),
        snippet: trunc(r?.snippet),
        summary: trunc(r?.summary ?? r?.snippet),
        siteName: typeof r?.siteName === 'string' && r.siteName ? r.siteName : hostOf(r?.url ?? ''),
      }));

      return {
        count: results.length,
        results,
        note: results.length === 0 ? '联网未找到相关结果。' : undefined,
      };
    } catch (e: any) {
      const aborted = controller.signal.aborted;
      return {
        count: 0,
        results: [],
        note: aborted ? `联网搜索超时(${TIMEOUT_MS}ms)。请改用本地知识库或稍后再试。` : `联网搜索出错:${e?.message ?? e}`,
      };
    } finally {
      clearTimeout(killer);
    }
  },
});
