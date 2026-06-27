import { useState } from 'react';
import { Brain, Check, ChevronDown, Menu, Moon, Sun, X } from 'lucide-react';
import type { ModelMeta } from '../types';

type Props = {
  models: ModelMeta[];
  model: string;
  onModel: (id: string) => void;
  thinking: boolean;
  onThinking: () => void;
  theme: 'light' | 'dark';
  onTheme: () => void;
  onMenu: () => void;
  embed?: boolean;
  onClose?: () => void;
};

export function Topbar({ models, model, onModel, thinking, onThinking, theme, onTheme, onMenu, embed, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const cur = models.find((m) => m.id === model);
  const thinkAvailable = cur ? cur.thinking : false;

  return (
    <header className="flex items-center justify-between gap-2 border-b border-black/10 px-3 py-2.5 dark:border-white/5 md:px-5 md:py-3.5">
      <div className="flex min-w-0 items-center gap-2">
        <button onClick={onMenu} className={'grid size-9 shrink-0 place-items-center rounded-xl border border-white/40 bg-white/50 dark:bg-white/5 ' + (embed ? '' : 'md:hidden')}>
          <Menu className="size-5" />
        </button>

        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-xl border border-white/40 bg-white/50 px-3 py-2 dark:bg-white/5"
          >
            <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(34,197,94,.2)]" />
            <span className="text-[14px] font-bold">{cur?.label || 'DeepSeek V4'}</span>
            <span className="text-faint hidden text-[12px] font-semibold sm:inline">{cur?.provider}</span>
            <ChevronDown className={`text-sub size-3.5 transition ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
              <div className="glass absolute left-0 top-12 z-30 flex min-w-[236px] flex-col gap-0.5 rounded-2xl p-1.5" style={{ animation: 'riseIn .18s ease both' }}>
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onModel(m.id);
                      setOpen(false);
                    }}
                    className={`flex items-center justify-between gap-2 rounded-xl px-2.5 py-2.5 text-left ${m.id === model ? 'bg-black/5 dark:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="text-[13.5px] font-bold">{m.label}</span>
                      {m.thinking && (
                        <span className="rounded-full px-1.5 text-[10px] font-bold" style={{ color: 'var(--accent)', background: 'color-mix(in oklab, var(--accent) 14%, transparent)' }}>
                          深度思考
                        </span>
                      )}
                      <span className="text-faint text-[11.5px] font-semibold">{m.provider}</span>
                    </span>
                    {m.id === model && <Check className="size-4" style={{ color: 'var(--accent)' }} />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {thinkAvailable && (
          <button
            onClick={onThinking}
            title="深度思考：让模型先推理再作答（DeepSeek V4）"
            className="flex h-10 items-center gap-1.5 rounded-xl border px-3 text-[12.5px] font-bold transition"
            style={
              thinking
                ? { color: 'var(--accent)', borderColor: 'var(--accent)', background: 'color-mix(in oklab, var(--accent) 12%, transparent)' }
                : { color: 'var(--sub)', borderColor: 'rgba(120,120,160,.22)', background: 'transparent' }
            }
          >
            <Brain className="size-4" />
            <span className="hidden sm:inline">深度思考</span>
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button onClick={onTheme} className="grid size-9 place-items-center rounded-xl border border-white/40 bg-white/50 dark:bg-white/5">
          {theme === 'dark' ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
        </button>
        {embed && onClose && (
          <button onClick={onClose} title="关闭" className="grid size-9 place-items-center rounded-xl border border-white/40 bg-white/50 dark:bg-white/5">
            <X className="size-5" />
          </button>
        )}
      </div>
    </header>
  );
}
