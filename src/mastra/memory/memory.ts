import { Memory } from '@mastra/memory';
import { PostgresStore, PgVector } from '@mastra/pg';
import { fastembed } from '@mastra/fastembed';
import { attachPgPoolErrorHandler } from '../util/crash-guard';

const connectionString = process.env.DATABASE_URL!;

// 提为具名实例，给其内部 pg.Pool 挂 error 监听——这两条 pool 承载每次对话的记忆读写+语义召回，
// 是 P0-2「空闲连接被断开即 crash 进程」的主要承载面（自建 db/pool.ts 反而是次要面）。
const memStore = new PostgresStore({ id: 'superdocs-mem', connectionString });
const memVector = new PgVector({ id: 'superdocs-vec', connectionString });
attachPgPoolErrorHandler((memStore as any).pool, 'memory-store');
attachPgPoolErrorHandler((memVector as any).pool, 'memory-vector');

export const memory = new Memory({
  storage: memStore,
  vector: memVector,
  embedder: fastembed,
  options: {
    lastMessages: 20,
    semanticRecall: { topK: 3, messageRange: 2, scope: 'resource' },
    workingMemory: {
      enabled: true,
      scope: 'resource', // 个人记忆按用户(resource)持久化,跨该用户的所有会话共享
      template: [
        '# 用户档案',
        '- 学号(user_name):',
        '- 姓名(real_name):',
        '- 学院/专业:',
        '- 角色(roles):',
        '- 常用课程:',
        '- 偏好(语言/详略):',
        '- 默认模型:',
      ].join('\n'),
    },
    // observationalMemory: true, // TODO: 表 mastra_observational_memory 未自动建,待迁移后开
  },
});
