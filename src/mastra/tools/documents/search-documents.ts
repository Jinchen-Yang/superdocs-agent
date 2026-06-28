import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { index, byId } from './search-index';

// 资料详情页(可点开看/下载):byrdocs 前端用 ?q=<md5> 识别并展示该文档。
const SITE = process.env.BYRDOCS_SITE_URL || 'https://byrdocs.cloudlay.cn';

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
      course: z.string().optional(), year: z.string().optional(), stage: z.string().optional(), filetype: z.string(),
      link: z.string(),
    })),
  }),
  execute: async ({ query, type, course, limit }) => {
    let hits = index.search(query) as any[];
    if (type) hits = hits.filter((h) => h.type === type);
    if (course) hits = hits.filter((h) => (h.course || '').includes(course));
    const lim = limit ?? 8;
    return {
      count: Math.min(hits.length, lim),
      results: hits.slice(0, lim).map((h) => {
        // 试卷"年份"用学年区间(如 2018-2019)而非单一年份——否则上学期(First)考试会被 time.end 标成次年;
        // 同时带上 stage(期中/期末),避免 agent 没这个字段只能瞎猜。
        const t = byId.get(h.id)?.data?.time || {};
        const year = (t.start && t.end) ? `${t.start}-${t.end}` : (h.year || undefined);
        return {
          id: h.id, type: h.type, title: h.title,
          course: h.course || undefined, year, stage: t.stage || h.stage || undefined, filetype: h.filetype,
          link: `${SITE}/?q=${h.id}`,
        };
      }),
    };
  },
});
