import { createContext, useContext, useRef, useState, type FC } from 'react';
import {
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  type AssistantState,
} from '@assistant-ui/react';
import { ArrowUp, Check, Copy, ImagePlus, Sparkles, Square, X } from 'lucide-react';
import { MarkdownText } from './markdown-text';
import type { Attachment } from './useChatController';

const cn = (...a: (string | false | undefined)[]) => a.filter(Boolean).join(' ');

// 欢迎页建议卡片通过 context 触发发送(绕开 composer 直接走 controller.send)
const SendContext = createContext<(text: string) => void>(() => {});
export const ChatSendProvider = SendContext.Provider;

// 图片附件上下文：组合器据此显示上传按钮/预览，发送由 controller 读取附件。
type AttachmentCtx = { attachment: Attachment | null; attach: (f: File) => void; clear: () => void };
const AttachmentContext = createContext<AttachmentCtx>({ attachment: null, attach: () => {}, clear: () => {} });
export const AttachmentProvider = AttachmentContext.Provider;
const useAttachment = () => useContext(AttachmentContext);

const isNewChat = (s: AssistantState) =>
  s.thread.messages.length === 0 && (!s.thread.isLoading || s.threads.isLoading);

const CARDS = [
  { title: '高等数学期末真题', sub: '历年卷 + 答案', prompt: '帮我找高等数学的期末真题，最好带答案', c: '#8a5cff' },
  { title: '沙河校区生活', sub: '宿舍 / 食堂 / 校园网', prompt: '沙河校区新生生活有什么要注意的？宿舍、食堂、校园网怎么搞', c: '#3b82f6' },
  { title: '数据结构复习资料', sub: '课件 / 题库 / 笔记', prompt: '数据结构这门课有哪些复习资料？', c: '#19c39c' },
  { title: '报到准备', sub: '入学要带什么', prompt: '大一新生报到要提前准备和办理什么？', c: '#ff6b9d' },
];

const greeting = () => {
  const h = new Date().getHours();
  if (h < 6) return '夜深了，还在忙吗？';
  if (h < 12) return '早上好，今天想了解点什么？';
  if (h < 18) return '下午好，有什么可以帮你？';
  return '晚上好，有什么可以帮你？';
};

const Welcome: FC = () => {
  const send = useContext(SendContext);
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col items-center py-6 text-center" style={{ animation: 'riseIn .5s ease both' }}>
      <div className="frost mb-5 grid size-16 place-items-center rounded-3xl">
        <Sparkles className="size-7" style={{ color: 'var(--accent)' }} />
      </div>
      <h1 className="m-0 text-2xl font-extrabold tracking-tight md:text-3xl">{greeting()}</h1>
      <p className="text-sub mb-7 mt-2 max-w-[440px] text-[15px] leading-relaxed">
        我是 superdocs 助手，帮北邮的同学查资料、看真题、答疑解惑。试试下面的，或直接提问。
      </p>
      <div className="grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
        {CARDS.map((c) => (
          <button
            key={c.title}
            onClick={() => send(c.prompt)}
            className="frost group flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-transform hover:-translate-y-0.5"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: `${c.c}22`, border: `1px solid ${c.c}33` }}>
              <Sparkles className="size-5" style={{ color: c.c }} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold">{c.title}</span>
              <span className="text-sub block text-[12.5px]">{c.sub}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

const UserMessage: FC = () => (
  <MessagePrimitive.Root className="flex justify-end" style={{ animation: 'msgIn .35s ease both' }}>
    <div className="accent-grad max-w-[85%] whitespace-pre-wrap break-words rounded-[18px_18px_5px_18px] border border-white/25 px-3.5 py-2 text-[15px] leading-snug text-white shadow-lg">
      <MessagePrimitive.Parts />
    </div>
  </MessagePrimitive.Root>
);

const CopyButton: FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => {},
        );
      }}
      aria-label="复制回答"
      className="text-faint mt-1.5 flex items-center gap-1 text-[11.5px] transition hover:text-[var(--sub)]"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? '已复制' : '复制'}
    </button>
  );
};

// 思考过程渲染：MiMo / DeepSeek-思考 会先流式输出 reasoning，再出正文。
// 此前 Parts 只给了 Text、没给 Reasoning 组件 → 思考内容被丢弃不显示 →
// 看起来"想完才蹦答案"。这里把它渲染成可折叠的流式块，思考阶段就有可见反馈。
const ReasoningPart = ({ text }: { text?: string }) => {
  if (!text || !text.trim()) return null;
  return (
    <details open className="aui-reasoning mb-2 rounded-xl border border-white/30 bg-black/[0.04] px-3 py-2 dark:bg-white/5">
      <summary className="text-faint cursor-pointer select-none text-[12px] font-medium">💭 思考过程</summary>
      <div className="text-sub mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap text-[12.5px] leading-relaxed opacity-80">
        {text}
      </div>
    </details>
  );
};

const AssistantMessage: FC = () => {
  // 取本条助手消息的正文(text 分块)用于复制；reasoning/检索占位不计入。
  const text = useAuiState((s) => {
    const c = s.message.content as { type?: string; text?: string }[];
    return Array.isArray(c) ? c.filter((p) => p?.type === 'text').map((p) => p?.text || '').join('') : '';
  });
  return (
    <MessagePrimitive.Root className="flex items-start gap-3" style={{ animation: 'msgIn .35s ease both' }}>
      <div className="accent-grad mt-0.5 grid size-8 shrink-0 place-items-center rounded-[10px] shadow">
        <Sparkles className="size-4 text-white" />
      </div>
      <div className="frost min-w-0 max-w-[88%] rounded-[6px_20px_20px_20px] px-4 py-3 text-[15px] leading-relaxed">
        <MessagePrimitive.Parts components={{ Text: MarkdownText, Reasoning: ReasoningPart }} />
        {text.trim() && <CopyButton text={text} />}
      </div>
    </MessagePrimitive.Root>
  );
};

const Msg: FC = () => {
  const role = useAuiState((s) => s.message.role);
  return role === 'user' ? <UserMessage /> : <AssistantMessage />;
};

const Composer: FC = () => {
  const { attachment, attach, clear } = useAttachment();
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="mx-auto w-full max-w-[820px] px-3 pb-3 pt-1 md:px-5 md:pb-4">
      {attachment && (
        <div className="mb-2 flex items-center gap-2 px-1">
          <div className="relative">
            <img src={attachment.dataUrl} alt={attachment.name} className="size-16 rounded-xl border border-white/30 object-cover" />
            <button
              onClick={clear}
              aria-label="移除图片"
              className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-rose-500 text-white shadow"
            >
              <X className="size-3" />
            </button>
          </div>
          <span className="text-faint text-[12px]">已自动切换多模态模型识别图片</span>
        </div>
      )}
      <ComposerPrimitive.Root className="glass flex items-end gap-1.5 rounded-3xl py-2 pl-2 pr-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) attach(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="上传图片"
          title="上传图片（自动切换多模态模型）"
          className="grid size-10 shrink-0 place-items-center rounded-xl text-[var(--sub)] transition hover:bg-black/5 dark:hover:bg-white/10"
        >
          <ImagePlus className="size-5" />
        </button>
        <ComposerPrimitive.Input
          rows={1}
          // 仅桌面(精确指针 + 宽屏)自动聚焦；移动端别一进来就弹键盘遮住欢迎页。
          autoFocus={typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches && window.innerWidth > 760}
          placeholder="给 superdocs 发送消息…"
          // 16px 字号：去掉禁缩放后避免 iOS 聚焦自动放大。
          className="max-h-36 min-h-6 flex-1 resize-none bg-transparent py-2 text-base leading-normal outline-none placeholder:text-[var(--faint)]"
        />
        <AuiIf condition={(s) => !s.thread.isRunning}>
          <ComposerPrimitive.Send asChild>
            <button aria-label="发送" className="accent-grad grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-md transition-transform hover:scale-105 disabled:opacity-40">
              <ArrowUp className="size-5" />
            </button>
          </ComposerPrimitive.Send>
        </AuiIf>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <ComposerPrimitive.Cancel asChild>
            <button aria-label="停止生成" className="accent-grad grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-md">
              <Square className="size-3.5 fill-current" />
            </button>
          </ComposerPrimitive.Cancel>
        </AuiIf>
      </ComposerPrimitive.Root>
      <div className="text-faint mt-2 text-center text-[11.5px]">superdocs 可能出错，资料请以原站为准。</div>
    </div>
  );
};

export const Thread: FC = () => {
  const empty = useAuiState(isNewChat);
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto">
        <div className={cn('mx-auto flex w-full max-w-[820px] flex-1 flex-col px-3 pt-4 md:px-5', empty && 'justify-center')}>
          <AuiIf condition={isNewChat}>
            <Welcome />
          </AuiIf>
          <div className="flex flex-col gap-6 pb-4 empty:hidden">
            <ThreadPrimitive.Messages>{() => <Msg />}</ThreadPrimitive.Messages>
          </div>
        </div>
      </ThreadPrimitive.Viewport>
      <Composer />
    </ThreadPrimitive.Root>
  );
};
