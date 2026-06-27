import { registerApiRoute } from '@mastra/core/server';
import { randomUUID } from 'node:crypto';
import { docsAgent } from '../agents/docs-agent';
import { resolveModel, MODELS, DEFAULT_MODEL, thinkingProviderOptions } from '../models/registry';
import { memory } from '../memory/memory';
import { authed } from '../auth/guard';
import { query } from '../db/pool';
import { log } from '../util/log';

const mem = memory as any;

function extractText(content: any): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p: any) => (typeof p === 'string' ? p : p?.text || '')).join(' ');
  return content.text || content.content || '';
}

// 确保 thread 存在并带标题：首条消息时用首条用户消息生成标题，使会话立刻以正确标题出现在列表。
async function ensureThreadTitled(threadId: string, resourceId: string, messages: any[]): Promise<void> {
  try {
    const existing = await mem.getThreadById({ threadId, resourceId }).catch(() => null);
    const firstUser = Array.isArray(messages) ? messages.find((m: any) => m?.role === 'user') : null;
    const raw = extractText(firstUser?.content ?? firstUser?.text ?? '');
    const title = (raw || '新对话').replace(/\s+/g, ' ').trim().slice(0, 30) || '新对话';
    const now = new Date();
    if (!existing) {
      await mem.saveThread({ thread: { id: threadId, title, resourceId, createdAt: now, updatedAt: now, metadata: {} } });
    } else if (!existing.title || existing.title === '新对话') {
      await mem.updateThread({ id: threadId, title, metadata: existing.metadata || {} });
    }
  } catch { /* 标题非关键，失败忽略 */ }
}

// 记录 token 用量（AI SDK 的 usage 是流结束后 resolve 的 Promise）。best-effort。
async function recordUsage(result: any, userId: string, threadId: string, model: string): Promise<void> {
  try {
    const usage = await (result?.usage ?? result?.totalUsage ?? null);
    if (!usage) return;
    const input = Number(usage.inputTokens ?? usage.promptTokens ?? 0) || 0;
    const output = Number(usage.outputTokens ?? usage.completionTokens ?? 0) || 0;
    if (!input && !output) return;
    await query(
      'INSERT INTO app_usage (user_id, thread_id, model, input_tokens, output_tokens) VALUES ($1,$2,$3,$4,$5)',
      [userId, threadId, model, input, output],
    );
  } catch (e: any) {
    // 用量入库失败不影响对话，但不再完全静默——记一条，避免计费/统计数据悄悄缺失。
    log.warn('token 用量记录失败', { err: e?.message || String(e), userId, model });
  }
}

// 从一个 fullStream part 里取出增量文本（兼容 text / textDelta / delta / payload.text 等形态）。
function deltaText(part: any): string {
  return part?.text ?? part?.textDelta ?? part?.delta ?? part?.payload?.text ?? part?.payload?.delta ?? '';
}

export const chatRoutes = [
  registerApiRoute('/app/chat', {
    method: 'POST',
    handler: authed(async (c, user) => {
      let body: any;
      try { body = await c.req.json(); } catch { return c.json({ error: '请求体需为 JSON' }, 400); }
      const { messages, model, thread, thinking } = body || {};
      if (!messages) return c.json({ error: 'messages 必填' }, 400);

      const modelId = model && MODELS[model] ? model : DEFAULT_MODEL;
      const threadId: string = thread || randomUUID();
      const resource = user.id;
      const wantThinking = !!thinking;
      const providerOptions = thinkingProviderOptions(modelId, wantThinking);

      // 会话归属校验：指定了已存在的 thread 必须属于当前用户（与 conversations.ts 的 owned() 一致），
      // 防止传入他人 threadId 写入/污染其会话。
      if (thread) {
        const existing = await mem.getThreadById({ threadId, resourceId: resource }).catch(() => null);
        if (existing && existing.resourceId !== resource) return c.json({ error: '会话不存在' }, 404);
      }

      await ensureThreadTitled(threadId, resource, messages);

      // 缺 API key 时 resolveModel 会抛错，转成清晰的 503 而非裸 500/下游 401。
      let resolved: any;
      try { resolved = resolveModel(modelId); }
      catch (e: any) { return c.json({ error: '该模型暂不可用：' + (e?.message || e) }, 503); }

      // token 关键:封顶工具循环步数。无上限时模型会狂调检索工具(实测一问 58~95 次工具调用,
      // 每步都重发上下文 → input 爆炸)。一次问答 ≤6 步足够(搜→取→必要时再搜→答)。
      const streamOpts: any = { model: resolved, memory: { resource, thread: threadId }, maxSteps: 6 };
      if (providerOptions) streamOpts.providerOptions = providerOptions;
      // 流初始化阶段(建连/鉴权/超时)抛错时给结构化 502，而非裸 500；细节只进日志不回显，避免泄露内部拓扑。
      let result: any;
      try {
        result = await docsAgent.stream(messages, streamOpts);
      } catch (e: any) {
        log.error('docsAgent.stream 初始化失败', { err: e?.message || String(e), model: modelId, userId: user.id });
        return c.json({ error: '对话服务暂时不可用，请稍后重试' }, 502);
      }

      void recordUsage(result, user.id, threadId, modelId);

      // 把 fullStream 转成 NDJSON：每行一条 { t:'r'|'t'|'tool'|'err', d:string }
      //   r=思考(reasoning) t=正文(text) tool=工具调用 err=错误
      const encoder = new TextEncoder();
      const fullStream = result.fullStream;
      const ndjson = new ReadableStream<Uint8Array>({
        async start(controller) {
          const emit = (t: string, d: string) => controller.enqueue(encoder.encode(JSON.stringify({ t, d }) + '\n'));
          try {
            for await (const part of fullStream) {
              const type = String(part?.type || '');
              if (type.startsWith('reasoning')) {
                const d = deltaText(part); if (d) emit('r', d);
              } else if (type === 'text-delta' || type === 'text') {
                const d = deltaText(part); if (d) emit('t', d);
              } else if (type === 'tool-call' || type.startsWith('tool-call')) {
                emit('tool', part?.toolName || part?.payload?.toolName || '检索资料');
              } else if (type === 'error') {
                emit('err', String(part?.error?.message ?? part?.error ?? 'error'));
              }
            }
          } catch (e: any) {
            emit('err', String(e?.message ?? e));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(ndjson, {
        status: 200,
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'X-Thread-Id': threadId,
          'X-Model': modelId,
          'X-Thinking': wantThinking ? '1' : '0',
          'Cache-Control': 'no-cache',
        },
      });
    }),
  }),
];
