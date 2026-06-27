import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// 挂载在 byrdocs.cloudlay.cn/app/ 下：base=/app/ 让资源引用走 /app/assets/*。
// dev 时把后端 API 代理到本地 mastra :3100。
export default defineConfig({
  base: process.env.VITE_BASE || '/app/',
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    proxy: Object.fromEntries(
      ['/app/auth', '/app/chat', '/app/conversations', '/app/profile', '/app/models'].map((p) => [
        p, { target: 'http://127.0.0.1:3100', changeOrigin: true },
      ]),
    ),
  },
});
