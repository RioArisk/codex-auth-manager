import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 防止Vite清除Rust输出
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    // Tauri在Windows上使用Chromium，在macOS和Linux上使用WebKit
    target: process.env.TAURI_ENV_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
    // 生产环境不生成sourcemap
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
})
