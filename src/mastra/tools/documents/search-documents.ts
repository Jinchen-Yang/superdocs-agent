import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { index, byId } from './search-index';

// 资料详情页(可点开看/下载):byrdocs 前端用 ?q=<md5> 识别并展示该文档。
const SITE = process.env.BYRDOCS_SITE_URL || 'https://byrdocs.cloudlay.cn';

export const searchDocuments = createTool({
  id: 'search_documents',
  description: '检索北邮可下载资料文件(教材 book / 试卷 test / 资料 doc)。支持课程名/书名/作者等关键词,并可按 type(类型)、course(课程)、college(学院,如"国际学院")、stage(期中/期末)精确过滤。要"具体的试卷/真题文件、教材 PDF"就用本工具(命中后 get_document 看详情、get_download_url 给下载链接)。',
  inputSchema: z.object({
    query: z.string().describe('搜索关键词,通常传课程名/书名,如 "大学物理" "高等数学"'),
    type: z.enum(['book', 'test', 'doc']).optional().describe('资料类型;找试卷传 test'),
    course: z.string().optional().describe('课程名包含匹配'),
    college: z.string().optional().describe('学院过滤(包含匹配),如 "国际学院"'),
    stage: z.enum(['期中', '期末']).optional().describe('考试阶段过滤(仅 test 有此字段)'),
    limit: z.number().int().min(1).max(20).default(8),
  }),
  outputSchema: z.object({
    count: z.number(),
    results: z.array(z.object({
      id: z.string(), type: z.string(), title: z.string(),
      course: z.string().optional(), college: z.string().optional(), year: z.string().optional(), stage: z.string().optional(), filetype: z.string(),
      link: z.string(),
    })),
  }),
  execute: async ({ query, type, course, college, stage, limit }) => {
    let hits = index.search(query) as any[];
    if (type) hits = hits.filter((h) => h.type === type);
    if (course) hits = hits.filter((h) => (h.course || '').includes(course));
    // college/stage 在索引里不便检索,这里按原始记录精确过滤,支持"按学院/按期中期末"筛查。
    if (college) hits = hits.filter((h) => {
      const cols = byId.get(h.id)?.data?.college;
      return Array.isArray(cols) && cols.some((x: any) => String(x).includes(college));
    });
    if (stage) hits = hits.filter((h) => (byId.get(h.id)?.data?.time?.stage || h.stage) === stage);
    const lim = limit ?? 8;
    return {
      count: Math.min(hits.length, lim),
      results: hits.slice(0, lim).map((h) => {
        // 试卷"年份"用学年区间(如 2018-2019)而非单一年份——否则上学期(First)考试会被 time.end 标成次年;
        // 同时带上 stage(期中/期末),避免 agent 没这个字段只能瞎猜。
        const rec = byId.get(h.id)?.data || {};
        const t = rec.time || {};
        const year = (t.start && t.end) ? `${t.start}-${t.end}` : (h.year || undefined);
        const cols = Array.isArray(rec.college) ? rec.college.join('、') : '';
        return {
          id: h.id, type: h.type, title: h.title,
          course: h.course || undefined, college: cols || undefined, year, stage: t.stage || h.stage || undefined, filetype: h.filetype,
          link: `${SITE}/?q=${h.id}`,
        };
      }),
    };
  },
});
