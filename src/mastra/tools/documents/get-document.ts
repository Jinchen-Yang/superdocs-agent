import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { byId } from './search-index';

export const getDocument = createTool({
  id: 'get_document',
  description: '按 md5 取某份资料的完整元信息。',
  inputSchema: z.object({ md5: z.string().length(32) }),
  execute: async ({ md5 }) => {
    const r = byId.get(md5);
    return r ? { found: true, record: r } : { found: false };
  },
});
