import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // 浏览器 → 本地代理 → 扣子开放平台（规避 CORS）
      '/coze-api': {
        target: 'https://api.coze.cn',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/coze-api/, ''),
      },
      // 运营后台三级配置 / LLM 中转 / RSS 拉取
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
})
