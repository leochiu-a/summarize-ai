import { defineConfig } from 'vite'

// dev（npm run dev）會同時 watch content 與 popup 兩個 build，兩者都寫進 dist。
// 若 content build 每次重建都清空 dist，會把 popup 產物一起刪掉（反之亦然），
// 因此 dev 模式下不清空（由 dev script 啟動前清一次）；一次性 build 仍照常清空。
const isDev = process.env.DEV_WATCH === '1'

// Chrome content script 不能直接用 ESM，因此打包成單一 IIFE 檔（含 React runtime）
export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: !isDev,
    lib: {
      entry: 'src/content.tsx',
      formats: ['iife'],
      name: 'SummarizeAiBuddy',
      fileName: () => 'content.js',
    },
  },
})
