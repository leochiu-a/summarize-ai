import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // extractContent 依賴 DOM 與 Readability，需要瀏覽器環境
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
