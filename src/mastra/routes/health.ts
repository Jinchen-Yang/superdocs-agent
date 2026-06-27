import { registerApiRoute } from '@mastra/core/server';
import { query } from '../db/pool';
import { totalDocs } from '../tools/documents/search-index';
import { totalKnowledge } from '../tools/knowledge/knowledge-index';

// 健康检查：探活 + 关键依赖(DB)与索引规模可观测。DB 不通时返回 503，便于反代/监控摘流量。
export const healthRoutes = [
  registerApiRoute('/app/health', {
    method: 'GET',
    handler: async (c) => {
      let db = false;
      try {
        // 加 2s 竞速超时：DB 硬挂时快速吐 503，而非阻塞到连接/语句超时(10~15s)被探针判成"无响应"。
        await Promise.race([
          query('SELECT 1'),
          new Promise((_, rej) => setTimeout(() => rej(new Error('health db timeout')), 2_000)),
        ]);
        db = true;
      } catch {
        /* db 保持 false */
      }
      return c.json(
        {
          ok: db,
          db,
          docs: totalDocs,
          knowledge: totalKnowledge,
          uptime: Math.round(process.uptime()),
        },
        db ? 200 : 503,
      );
    },
  }),
];
