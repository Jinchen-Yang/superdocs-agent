import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 镜像(快照)拥有的文件 md5 集：这些走用户自建镜像 byrdocs.cloudlay.cn(快、校园网友好)，
// 其余(快照没有的)一律回退原版 byrdocs.org —— 满足"我这没有的必须走 byrdocs"。
const MIRROR_PATH = process.env.MIRROR_MD5_PATH || join(process.cwd(), 'data/mirror-md5.json');
let mirrorSet: Set<string>;
try {
  mirrorSet = new Set<string>(JSON.parse(readFileSync(MIRROR_PATH, 'utf8')));
} catch {
  mirrorSet = new Set<string>();
}

export const getDownloadUrl = createTool({
  id: 'get_download_url',
  description: '生成某份资料的下载链接(受校园网/登录限制)。',
  inputSchema: z.object({ md5: z.string().length(32), filetype: z.enum(['pdf', 'zip']).default('pdf') }),
  execute: async ({ md5, filetype }) => {
    const ext = filetype ?? 'pdf';
    const inMirror = mirrorSet.has(md5);
    const host = inMirror ? 'https://byrdocs.cloudlay.cn' : 'https://byrdocs.org';
    return { url: `${host}/files/${md5}.${ext}`, source: inMirror ? 'mirror' : 'byrdocs', gated: inMirror };
  },
});
