import { useEffect, useState } from 'react';

// 极简全局轻提示：替代大面积静默的 catch{}，给保存/加载失败以可见反馈。
// aria-live=polite + role=status 让读屏也能播报。
type Item = { id: number; msg: string; kind: 'ok' | 'err' };
let push: (msg: string, kind: 'ok' | 'err') => void = () => {};

export const toast = {
  ok: (msg: string) => push(msg, 'ok'),
  err: (msg: string) => push(msg, 'err'),
};

export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    let n = 0;
    push = (msg, kind) => {
      const id = ++n;
      setItems((prev) => [...prev, { id, msg, kind }]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), 3200);
    };
    return () => {
      push = () => {};
    };
  }, []);

  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[70] flex -translate-x-1/2 flex-col items-center gap-2" role="status" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={
            'rounded-xl px-4 py-2 text-[13px] font-medium text-white shadow-lg ' + (t.kind === 'ok' ? 'bg-[var(--green)]' : 'bg-[var(--danger)]')
          }
          style={{ animation: 'riseIn .2s ease both' }}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
