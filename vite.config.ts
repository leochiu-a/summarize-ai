import { defineConfig } from 'vite'

// Chrome content script 不能直接用 ESM，因此打包成單一 IIFE 檔（含 React runtime）
export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: 'src/content.tsx',
      formats: ['iife'],
      name: 'SummarizeAiBuddy',
      fileName: () => 'content.js',
    },
  },
})
