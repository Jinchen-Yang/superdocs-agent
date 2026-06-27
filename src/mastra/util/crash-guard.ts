import { log } from './log';

// 识别「pg 空闲连接被对端断开 / 网络抖动」这类与进程内部状态无关、可安全忽略的连接错误。
function isIdleConnError(e: any): boolean {
  const msg = String(e?.message || e || '');
  const code = String(e?.code || '');
  return (
    ['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNREFUSED', '57P01', '57P02', '57P03', '08006', '08003'].includes(code) ||
    /Connection terminated|terminating connection|server closed the connection|ECONNRESET|EPIPE|connection timeout|Client has encountered a connection error/i.test(msg)
  );
}

let installed = false;

// 进程级兜底。@mastra/pg 内部还有若干我们够不到的 pg.Pool(如每个 PostgresStore 的 observability pool)，
// 它们的空闲连接出错时，未监听的 'error' 事件会冒泡成 uncaughtException 把整进程 crash
// （反向 SSH 隧道 / NAT 拓扑下几乎必然遇到）。这里只「吞掉」这类连接错误并记录、保持进程存活；
// 其余真正的异常仍按默认 fail-fast 退出，不掩盖 bug。
export function installCrashGuard(): void {
  if (installed) return;
  installed = true;
  process.on('uncaughtException', (e: any) => {
    if (isIdleConnError(e)) {
      log.error('忽略 pg/网络空闲连接异常(进程保活)', { err: e?.message || String(e), code: e?.code });
      return;
    }
    log.error('未捕获异常，进程退出', { err: e?.message || String(e), stack: e?.stack });
    process.exit(1);
  });
  process.on('unhandledRejection', (e: any) => {
    // 服务器不因一条游离的 rejection 整体退出；连接类的更要保活，其余仅记录以便排查。
    log.error('未处理的 Promise 拒绝(已记录，进程保活)', { err: e?.message || String(e), code: e?.code });
  });
}

// 给一个 pg.Pool 挂 'error' 监听，避免其空闲连接错误冒泡成 uncaughtException。best-effort：
// 取 pool 或挂监听失败都不抛错（进程级兜底仍兜底）。
export function attachPgPoolErrorHandler(
  pool: { on(ev: 'error', cb: (e: Error) => void): unknown } | null | undefined,
  label: string,
): void {
  try {
    pool?.on('error', (e: any) =>
      log.error(`${label} pg 空闲连接异常(已忽略，连接池自动回收重建)`, { err: e?.message || String(e) }),
    );
  } catch (e: any) {
    log.warn(`挂载 ${label} pool error 监听失败(已由进程级兜底覆盖)`, { err: e?.message || String(e) });
  }
}
