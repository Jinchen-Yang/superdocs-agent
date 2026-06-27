import { useEffect, useRef, type ReactNode } from 'react';

// 统一的模态对话框：role/aria-modal 语义 + Esc 关闭 + 焦点陷阱 + 关闭后恢复焦点。
// 解决"键盘/读屏用户被困在背景"的可访问性硬伤。
export function Dialog({
  label,
  onClose,
  children,
  className,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    prevFocus.current = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = (): HTMLElement[] =>
      el
        ? Array.from(
            el.querySelectorAll<HTMLElement>(
              'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
            ),
          ).filter((n) => n.offsetParent !== null)
        : [];
    (focusables()[0] || el)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const f = focusables();
        if (f.length === 0) {
          e.preventDefault();
          return;
        }
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      prevFocus.current?.focus?.();
    };
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-[rgba(30,20,60,.34)] backdrop-blur-sm" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={className} style={{ animation: 'riseIn .3s ease both' }}>
        {children}
      </div>
    </>
  );
}
