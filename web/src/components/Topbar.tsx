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
    <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5 md:px-5 md:py-3">
      <div className="flex min-w-0 items-center gap-2">
        <button onClick={onMenu} aria-label="打开侧边菜单" className={'surface grid size-9 shrink-0 place-items-center rounded-xl transition hover:bg-[var(--hover)] ' + (embed ? '' : 'md:hidden')}>
          <Menu className="size-5" />
        </button>

        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="切换模型"
            aria-haspopup="listbox"
            aria-expanded={open}
            className="surface flex items-center gap-2 rounded-xl px-3 py-2 transition hover:bg-[var(--hover)]"
          >
            <span className="size-2 rounded-full bg-[var(--green)]" />
            <span className="text-[14px] font-medium">{cur?.label || 'DeepSeek V4'}</span>
            <span className="text-faint hidden text-[12px] sm:inline">{cur?.provider}</span>
            <ChevronDown className={`text-sub size-3.5 transition ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
              <div className="panel absolute left-0 top-12 z-30 flex min-w-[236px] flex-col gap-0.5 rounded-2xl p-1.5" style={{ animation: 'riseIn .18s ease both' }}>
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onModel(m.id);
                      setOpen(false);
                    }}
                    className={`flex items-center justify-between gap-2 rounded-xl px-2.5 py-2.5 text-left transition ${m.id === model ? 'bg-[var(--active)]' : 'hover:bg-[var(--hover)]'}`}
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="text-[13.5px] font-medium">{m.label}</span>
                      {m.thinking && (
                        <span className="text-accent rounded-full bg-[var(--accent-tint)] px-1.5 text-[10px] font-medium">
                          深度思考
                        </span>
                      )}
                      <span className="text-faint text-[11.5px]">{m.provider}</span>
                    </span>
                    {m.id === model && <Check className="text-accent size-4" />}
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
            aria-label="深度思考"
            aria-pressed={thinking}
            className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition ${
              thinking ? 'text-accent border-[var(--accent)] bg-[var(--accent-tint)]' : 'text-sub border-[var(--border-strong)]'
            }`}
          >
            <Brain className="size-4" />
            <span className="hidden sm:inline">深度思考</span>
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button onClick={onTheme} aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'} className="surface grid size-9 place-items-center rounded-xl transition hover:bg-[var(--hover)]">
          {theme === 'dark' ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
        </button>
        {embed && onClose && (
          <button onClick={onClose} title="关闭" aria-label="关闭" className="surface grid size-9 place-items-center rounded-xl transition hover:bg-[var(--hover)]">
            <X className="size-5" />
          </button>
        )}
      </div>
    </header>
  );
}
