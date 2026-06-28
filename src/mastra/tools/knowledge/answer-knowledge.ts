import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { kbIndex, kbById } from './knowledge-index';

// 合并检索工具(v1.1b):一步「搜 + 取正文 + 裁剪」替代旧的 search_knowledge + get_knowledge 两步。
// 目的 = 砍掉 agentic 多步重发上下文(token 大头):一次调用拿到答案就绪的相关正文。
// 每块正文上限 ~1200 字符,topK 默认 3 → 整条结果约 ~2k token,单次注入可控。
const PER_CHUNK = 1200;

export const answerKnowledge = createTool({
  id: 'answer_knowledge',
  description:
    '一步检索北邮新生答疑知识库并返回可直接据此作答的相关正文(生存指南=校园生活/选课/宿舍/校园网经验，真题=各课程期中期末题目)。' +
    '传问题或关键词即返回最相关的若干块正文(含出处 url、真题的 year/stage 等 meta)。' +
    '这是“答疑/找经验/看真题题目本身”的首选,一次到位;只有要“可下载的 PDF 资料”才用 search_documents。',
  inputSchema: z.object({
    query: z.string().describe('用户问题或关键词，如 "沙河宿舍用电" / "高等数学 期末"'),
    source: z.enum(['survival-guide', 'neowiki']).optional().describe('survival-guide=生存指南, neowiki=真题'),
    course: z.string().optional().describe('课程名包含匹配'),
    kind: z.enum(['guide', 'exam']).optional(),
    topK: z.number().int().min(1).max(5).default(3).describe('返回最相关的前几块，默认 3'),
  }),
  outputSchema: z.object({
    count: z.number(),
    results: z.array(
      z.object({
        title: z.string(),
        source: z.string(),
        kind: z.string(),
        course: z.string().optional(),
        url: z.string(),
        meta: z.record(z.string(), z.string()).optional(),
        text: z.string(),
        truncated: z.boolean(),
      }),
    ),
  }),
  execute: async ({ query, source, course, kind, topK }) => {
    let hits = kbIndex.search(query) as any[];
    if (source) hits = hits.filter((h) => h.source === source);
    if (kind) hits = hits.filter((h) => h.kind === kind);
    if (course) hits = hits.filter((h) => (h.course || '').includes(course));
    const k = topK ?? 3;
    const results = hits.slice(0, k).map((h) => {
      const chunk = kbById.get(h.id);
      const text = chunk?.text || '';
      const truncated = text.length > PER_CHUNK;
      return {
        title: h.title,
        source: h.source,
        kind: h.kind,
        course: h.course || undefined,
        url: h.url,
        meta: chunk?.meta,
        text: truncated ? text.slice(0, PER_CHUNK) + '…（正文较长已截断，如需更多请用更具体的关键词再查）' : text,
        truncated,
      };
    });
    return { count: results.length, results };
  },
});
