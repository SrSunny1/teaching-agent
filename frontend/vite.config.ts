import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 后端地址通过环境变量覆盖，默认本地 8000。
// 前端只用相对路径 /api/*，由这里的 proxy 转发，避免 CORS 与硬编码 IP。
const BACKEND = process.env.VITE_BACKEND ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
})
