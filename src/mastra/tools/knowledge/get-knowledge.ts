import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { kbById } from './knowledge-index';

// token 优化(v1.0.2)：整块正文注入上下文后会沉淀进对话历史被反复重发(知识块 p90≈4.8k 字符 / 最大 8k)。
// 仅截断超长块(中位 ~1k 字符不受影响)；长块的精细化(按相关段返回)留给 RAG / 更细粒度切块。
const MAX_TEXT = 1600;

export const getKnowledge = createTool({
  id: 'get_knowledge',
  description: '按 id 取知识库某一块的完整正文(配合 search_knowledge：先搜到 id，再取全文据此作答)。',
  inputSchema: z.object({ id: z.string() }),
  execute: async ({ id }) => {
    const chunk = kbById.get(id);
    if (!chunk) return { found: false };
    const text: string = chunk.text || '';
    const truncated = text.length > MAX_TEXT;
    return {
      found: true,
      truncated,
      chunk: truncated
        ? { ...chunk, text: text.slice(0, MAX_TEXT) + '…（正文较长已截断，如需更多请用更具体的关键词缩小检索范围）' }
        : chunk,
    };
  },
});
