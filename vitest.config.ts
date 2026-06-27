import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // 安全测试依赖的 env 在模块加载期被读取，这里统一注入（默认不设 TRUSTED_PROXY_HOPS=0）。
    env: {
      CAMPUS_CIDRS: '211.68.0.0/16,2001:da8:215::/48',
      ADMIN_IDS: '2021211000',
    },
  },
});
