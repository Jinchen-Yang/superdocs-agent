// 给任意 fetch 调用加「响应头超时」：连接 + 等待首个响应头若超过 timeoutMs 即 abort。
//
// 关键设计：定时器在 fetch() resolve（响应头到达）后立刻 clearTimeout，
// 因此对「流式响应」只约束到"开始返回"为止，不会在读流式 body 的中途把流掐断——
// 正是 LLM 流式补全需要的语义（既防上游一直不返回的 hang，又不杀正常长流）。
export function withTimeout(timeoutMs: number): typeof fetch {
  return (async (input: any, init: any = {}) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error(`请求超时(${timeoutMs}ms)`)), timeoutMs);
    // 保留调用方（如 AI SDK 取消流）原有的 signal：任一触发都中止本次请求。
    const upstream: AbortSignal | undefined = init?.signal;
    if (upstream) {
      if (upstream.aborted) ctrl.abort();
      else upstream.addEventListener('abort', () => ctrl.abort(), { once: true });
    }
    try {
      return await fetch(input, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }) as typeof fetch;
}

// 给「不可注入 fetch 的第三方异步调用」（如 @byrdocs/bupt-auth 的 login）封一个截止时间。
// 注意：底层请求并不会真正取消，但调用方的等待被限制住，避免重试循环里无限期挂起。
export function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}超时(${ms}ms)`)), ms);
  });
  // 给 p 单独挂一个 no-op handler：即便它输掉竞速、其后续 reject 也已"被处理"，
  // 不会冒泡成 unhandledRejection（否则慢 DB/慢上游在超时后才 reject 会产生噪音）。
  p.then(
    () => {},
    () => {},
  );
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
