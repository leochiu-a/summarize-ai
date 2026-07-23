import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Popup 是一般的 extension 頁面，可用 ESM。獨立於 content script 的 IIFE build。
// emptyOutDir: false → 不要清掉 content build 已產出的 dist 內容。
export default defineConfig({
  base: './',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: { popup: resolve(__dirname, 'popup.html') },
    },
  },
})
