import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const getDownloadUrl = createTool({
  id: 'get_download_url',
  description: '生成某份资料的下载链接(受校园网/登录限制)。',
  inputSchema: z.object({ md5: z.string().length(32), filetype: z.enum(['pdf', 'zip']).default('pdf') }),
  execute: async ({ md5, filetype }) => ({
    url: `https://byrdocs.cloudlay.cn/files/${md5}.${filetype ?? 'pdf'}`,
    gated: true,
  }),
});
