import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { kbById } from './knowledge-index';

export const getKnowledge = createTool({
  id: 'get_knowledge',
  description: '按 id 取知识库某一块的完整正文(配合 search_knowledge：先搜到 id，再取全文据此作答)。',
  inputSchema: z.object({ id: z.string() }),
  execute: async ({ id }) => {
    const chunk = kbById.get(id);
    return chunk ? { found: true, chunk } : { found: false };
  },
});
