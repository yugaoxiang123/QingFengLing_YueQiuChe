import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // 设置为相对路径，支持 file:// 协议
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // 确保所有资源使用相对路径
    rollupOptions: {
      output: {
        // 保持简单的文件命名，避免复杂的哈希
        assetFileNames: 'assets/[name].[ext]',
        chunkFileNames: 'assets/[name].js',
        entryFileNames: 'assets/[name].js'
      }
    }
  }
})
