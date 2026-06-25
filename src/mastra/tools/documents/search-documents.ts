import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { index } from './search-index';

export const searchDocuments = createTool({
  id: 'search_documents',
  description: '检索北邮资料(教材 book / 试题 test / 资料 doc)。支持课程名、书名、作者等关键词;可按类型/课程过滤。',
  inputSchema: z.object({
    query: z.string().describe('搜索关键词,如 "高等数学 期末"'),
    type: z.enum(['book', 'test', 'doc']).optional(),
    course: z.string().optional(),
    limit: z.number().int().min(1).max(20).default(8),
  }),
  outputSchema: z.object({
    count: z.number(),
    results: z.array(z.object({
      id: z.string(), type: z.string(), title: z.string(),
      course: z.string().optional(), year: z.string().optional(), filetype: z.string(),
    })),
  }),
  execute: async ({ query, type, course, limit }) => {
    let hits = index.search(query) as any[];
    if (type) hits = hits.filter((h) => h.type === type);
    if (course) hits = hits.filter((h) => (h.course || '').includes(course));
    const lim = limit ?? 8;
    return {
      count: Math.min(hits.length, lim),
      results: hits.slice(0, lim).map((h) => ({
        id: h.id, type: h.type, title: h.title,
        course: h.course || undefined, year: h.year || undefined, filetype: h.filetype,
      })),
    };
  },
});
