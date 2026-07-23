import { afterEach, describe, expect, it } from 'vitest'
import {
  CACHE_TTL_MS,
  clearSummaryCache,
  getCachedSummary,
  isFresh,
  setCachedSummary,
} from './summaryCache'

afterEach(async () => {
  await clearSummaryCache()
})

describe('isFresh', () => {
  it('TTL 內為新鮮', () => {
    const now = 1_000_000
    expect(isFresh(now - (CACHE_TTL_MS - 1), now)).toBe(true)
  })
  it('超過 TTL 為過期', () => {
    const now = 1_000_000
    expect(isFresh(now - (CACHE_TTL_MS + 1), now)).toBe(false)
  })
})

describe('快取讀寫（記憶體 fallback）', () => {
  it('寫入後可讀回同一頁的摘要', async () => {
    await setCachedSummary('# 重點', '測試標題')
    const cached = await getCachedSummary()
    expect(cached?.markdown).toBe('# 重點')
    expect(cached?.title).toBe('測試標題')
  })

  it('清空後讀不到', async () => {
    await setCachedSummary('內容', '標題')
    await clearSummaryCache()
    expect(await getCachedSummary()).toBeNull()
  })
})
