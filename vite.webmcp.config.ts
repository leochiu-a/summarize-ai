import { defineConfig } from 'vite'

// 第三個 bundle：WebMCP 註冊層。跑在 MAIN world，所以刻意與 content.js 分開打包
// （MAIN world 沒有 chrome.*，混在一起會把 chrome 相依也拉進來）。
// 同樣打成 IIFE —— content script 不能直接吃 ESM。
// emptyOutDir 一律 false：content / popup / webmcp 三個 build 都寫進同一個 dist，
// 誰清空都會刪掉別人的產物（清空只由 content build 在非 watch 模式做一次）。
export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/webmcp.ts',
      formats: ['iife'],
      name: 'SummarizeAiWebMcp',
      fileName: () => 'webmcp.js',
    },
  },
})
