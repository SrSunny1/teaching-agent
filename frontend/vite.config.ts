import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 后端地址通过环境变量覆盖，默认本地 8000。
// 前端只用相对路径 /api/*，由这里的 proxy 转发，避免 CORS 与硬编码 IP。
const BACKEND = process.env.VITE_BACKEND ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // ★ 轮询文件变化。
    //
    // 为什么必须开：项目放在 WSL 挂载盘（/mnt/e 这种 DrvFs）上时，inotify 不工作，
    // Vite 默认的 chokidar 监听收不到任何事件 —— HMR 完全不触发，而且**连浏览器硬刷新
    // 都救不回来**：Vite 自己认为文件没变，会一直吐改动前的编译结果。
    // 症状极具误导性：源码明明改了、`tsc -b` 也过了，界面就是没反应。
    //
    // 项目若在 WSL 的 Linux 侧（~/ 下）或 Windows 原生盘上，开着只是多一点 CPU
    // 开销（Vite 默认已忽略 node_modules / .git），不会出错，所以不必分环境。
    watch: { usePolling: true },
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
})
