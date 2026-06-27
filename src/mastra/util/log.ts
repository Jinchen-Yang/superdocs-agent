// 极简结构化日志：单行 JSON，便于反代/容器日志采集与 grep。
// 不引第三方依赖，保持零运行时成本。新代码统一走这里；存量 console.* 暂不强制迁移。
type Level = 'info' | 'warn' | 'error';

function emit(level: Level, msg: string, extra?: Record<string, unknown>): void {
  let line: string;
  try {
    line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra });
  } catch {
    // extra 含循环引用等不可序列化值时退化为纯文本，绝不让日志本身抛错。
    line = `${new Date().toISOString()} [${level}] ${msg}`;
  }
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, extra?: Record<string, unknown>) => emit('info', msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => emit('warn', msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => emit('error', msg, extra),
};
