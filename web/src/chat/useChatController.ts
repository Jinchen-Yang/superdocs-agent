import { useCallback, useRef, useState, type RefObject } from 'react';
import {
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { api, uid } from '../api';
import type { ChatMessage } from '../types';

type ControllerOpts = {
  modelRef: RefObject<string>;
  thinkingRef: RefObject<boolean>;
  onAuthExpired: () => void;
  onConversationsChanged: () => void;
};

const convertMessage = (m: ChatMessage): ThreadMessageLike => {
  const parts: ({ type: 'text'; text: string } | { type: 'reasoning'; text: string })[] = [];
  if (m.role === 'assistant') {
    if (m.reasoning) parts.push({ type: 'reasoning', text: m.reasoning });
    else if (m.searching && !m.content) parts.push({ type: 'reasoning', text: '🔍 正在检索北邮资料…' });
  }
  parts.push({ type: 'text', text: m.content });
  return { id: m.id, role: m.role, content: parts };
};

export function useChatController(opts: ControllerOpts) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isRunning, setRunning] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const threadRef = useRef<string>(uid());
  const abortRef = useRef<AbortController | null>(null);
  const activeRef = useRef<string | null>(null);
  activeRef.current = activeId;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const patch = (id: string, p: Partial<ChatMessage>) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...p } : m)));

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || abortRef.current) return;
    const aId = uid();
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: 'user', content: t },
      { id: aId, role: 'assistant', content: '', reasoning: '' },
    ]);
    setRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const thread = threadRef.current;
    let content = '';
    let reasoning = '';
    let searching = false;
    try {
      const res = await fetch('/app/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: t }],
          model: optsRef.current.modelRef.current,
          thread,
          thinking: optsRef.current.thinkingRef.current,
        }),
        signal: ctrl.signal,
      });
      if (res.status === 401 || res.status === 403) {
        optsRef.current.onAuthExpired();
        return;
      }
      if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      const handle = (line: string) => {
        let o: { t?: string; d?: string };
        try {
          o = JSON.parse(line);
        } catch {
          return;
        }
        if (o.t === 't') content += o.d ?? '';
        else if (o.t === 'r') reasoning += o.d ?? '';
        else if (o.t === 'tool') searching = true;
        else if (o.t === 'err') content += (content ? '\n' : '') + '[出错] ' + (o.d ?? '');
        patch(aId, { content, reasoning, searching: searching && !content });
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const l = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (l) handle(l);
        }
      }
      if (buf.trim()) handle(buf.trim());
      if (!content.trim() && !reasoning.trim()) patch(aId, { content: '（无回复，请检查模型配置）' });
    } catch (e) {
      if (!ctrl.signal.aborted) {
        patch(aId, { content: (content ? content + '\n' : '') + '出错：' + ((e as Error)?.message || String(e)) });
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
      if (!activeRef.current) setActiveId(thread);
      optsRef.current.onConversationsChanged();
    }
  }, []);

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const text = message.content.find((c) => c.type === 'text')?.text ?? '';
      await send(text);
    },
    [send],
  );
  const onCancel = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
  }, []);

  const runtime = useExternalStoreRuntime({ messages, isRunning, convertMessage, onNew, onCancel });

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    threadRef.current = uid();
    setActiveId(null);
    setMessages([]);
    setRunning(false);
  }, []);

  const openConversation = useCallback(async (id: string) => {
    abortRef.current?.abort();
    abortRef.current = null;
    threadRef.current = id;
    setActiveId(id);
    setMessages([]);
    setRunning(false);
    try {
      const { messages: ms } = await api.messages(id);
      setMessages(ms.filter((m) => m.content).map((m) => ({ id: uid(), role: m.role, content: m.content })));
    } catch {
      /* ignore */
    }
  }, []);

  return { runtime, activeId, hasMessages: messages.length > 0, isRunning, newChat, openConversation, send };
}
