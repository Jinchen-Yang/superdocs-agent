import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { kbIndex, kbById } from './knowledge-index';

export const searchKnowledge = createTool({
  id: 'search_knowledge',
  description:
    '检索北邮新生答疑知识库的正文内容(生存指南=校园生活/选课/宿舍/校园网等经验，真题=各课程期中期末题目)。' +
    '用于"直接答疑/给经验/看真题题目本身"，区别于 search_documents(找可下载的 PDF 资料)。',
  inputSchema: z.object({
    query: z.string().describe('如 "沙河宿舍用电" / "高等数学 期末"'),
    source: z.enum(['survival-guide', 'neowiki']).optional().describe('survival-guide=生存指南, neowiki=真题'),
    course: z.string().optional().describe('课程名包含匹配'),
    kind: z.enum(['guide', 'exam']).optional(),
    limit: z.number().int().min(1).max(20).default(6),
  }),
  outputSchema: z.object({
    count: z.number(),
    results: z.array(
      z.object({
        id: z.string(), source: z.string(), kind: z.string(),
        title: z.string(), course: z.string().optional(), url: z.string(), snippet: z.string(),
      }),
    ),
  }),
  execute: async ({ query, source, course, kind, limit }) => {
    let hits = kbIndex.search(query) as any[];
    if (source) hits = hits.filter((h) => h.source === source);
    if (kind) hits = hits.filter((h) => h.kind === kind);
    if (course) hits = hits.filter((h) => (h.course || '').includes(course));
    const lim = limit ?? 6;
    const results = hits.slice(0, lim).map((h) => ({
      id: h.id, source: h.source, kind: h.kind, title: h.title,
      course: h.course || undefined, url: h.url,
      snippet: (kbById.get(h.id)?.text || '').slice(0, 160),
    }));
    return { count: results.length, results };
  },
});
