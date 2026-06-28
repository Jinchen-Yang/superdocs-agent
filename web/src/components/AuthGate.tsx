import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api } from '../api';
import type { User } from '../types';

type Mode = 'sso' | 'migrate';

export function AuthGate({ onAuthed }: { onAuthed: (u: User) => void }) {
  const [mode, setMode] = useState<Mode>('sso');
  const [form, setForm] = useState({ studentId: '', ssoPassword: '', oldUsername: '', oldPassword: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ campus: boolean; gate: boolean } | null>(null);
  const isMigrate = mode === 'migrate';

  useEffect(() => {
    api.whoami().then((w) => w && setInfo({ campus: w.campus, gate: w.gate }));
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setError('');
  };

  const run = async (fn: () => Promise<{ user: User }>) => {
    setBusy(true);
    setError('');
    try {
      const { user } = await fn();
      onAuthed(user);
    } catch (e) {
      setError((e as Error).message || '失败');
      setBusy(false);
    }
  };

  const submit = () => {
    if (busy) return; // 防 Enter 绕过 disabled 重复提交
    const studentId = form.studentId.trim();
    if (isMigrate) {
      const oldUsername = form.oldUsername.trim();
      if (!oldUsername || !form.oldPassword) return setError('请填写旧账号的用户名和密码');
      if (!studentId || !form.ssoPassword) return setError('请填写学号和统一认证密码');
      return run(() =>
        api.merge({ oldUsername, oldPassword: form.oldPassword, studentId, ssoPassword: form.ssoPassword }),
      );
    }
    if (!studentId || !form.ssoPassword) return setError('请填写学号和统一认证密码');
    return run(() => api.sso({ studentId, password: form.ssoPassword }));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  const inputCls = 'w-full rounded-xl border border-white/40 bg-white/60 px-3.5 py-3 text-base outline-none dark:bg-white/5';

  return (
    <div
      className="grid h-full place-items-center p-6"
      style={{
        paddingTop: 'calc(1.5rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(1.5rem + max(env(safe-area-inset-bottom), var(--kb, 0px)))',
        transition: 'padding-bottom .18s ease',
      }}
    >
      <div className="glass flex w-full max-w-[380px] flex-col gap-3 rounded-3xl px-7 py-8 text-center" style={{ animation: 'riseIn .5s ease both' }}>
        <div className="accent-grad mx-auto grid size-14 place-items-center rounded-2xl shadow-lg">
          <Sparkles className="size-7 text-white" />
        </div>
        <h1 className="m-0 text-xl font-extrabold">登录 superdocs</h1>
        <p className="text-sub -mt-1 text-[13px]">北邮智能助手 · 资料检索 + 新生答疑</p>

        {info?.gate && (
          <div className="text-[12px] font-semibold" style={{ color: info.campus ? '#19c39c' : 'var(--accent)' }}>
            {info.campus ? '✓ 你在校园网内' : '校外访问：用北邮统一认证登录即可'}
          </div>
        )}

        {isMigrate ? (
          <>
            <p className="text-sub -mt-1 text-[12.5px] leading-relaxed">
              把你<strong>改版前的本地账号</strong>合并到统一认证：填旧账号 + 学号验证身份，原对话记录会一并保留到同一个账号。
            </p>
            <input className={inputCls} placeholder="旧账号用户名" value={form.oldUsername} onChange={set('oldUsername')} onKeyDown={onKey} />
            <input className={inputCls} type="password" placeholder="旧账号密码" value={form.oldPassword} onChange={set('oldPassword')} onKeyDown={onKey} />
            <div className="frost my-1 h-px w-full" />
            <input className={inputCls} placeholder="学号" value={form.studentId} onChange={set('studentId')} onKeyDown={onKey} />
            <input className={inputCls} type="password" placeholder="统一认证密码" value={form.ssoPassword} onChange={set('ssoPassword')} onKeyDown={onKey} />
          </>
        ) : (
          <>
            <input className={inputCls} placeholder="学号" value={form.studentId} onChange={set('studentId')} onKeyDown={onKey} />
            <input className={inputCls} type="password" placeholder="统一认证密码" value={form.ssoPassword} onChange={set('ssoPassword')} onKeyDown={onKey} />
            <p className="text-faint -mt-1 text-[11.5px] leading-relaxed">用北邮学号和统一身份认证密码登录，校内外均可用，仅验证身份不存储密码。</p>
          </>
        )}

        {error && <div className="text-[13px] font-semibold text-rose-500">{error}</div>}

        <button className="accent-grad mt-1 rounded-xl py-3 text-[15px] font-bold text-white shadow-md disabled:opacity-60" onClick={submit} disabled={busy}>
          {busy ? '请稍候…' : isMigrate ? '验证并合并' : '统一认证登录'}
        </button>

        <button
          className="py-1 text-[13px] font-semibold"
          style={{ color: 'var(--accent)' }}
          onClick={() => {
            setMode(isMigrate ? 'sso' : 'migrate');
            setError('');
          }}
        >
          {isMigrate ? '← 返回统一认证登录' : '改版前注册过本地账号？点此合并到统一认证'}
        </button>
      </div>
    </div>
  );
}
