import { describe, expect, it } from 'vitest'
import {
  PRODUCT_CACHE_TTL_MS,
  getCachedProductSummary,
  isFresh,
  setCachedProductSummary,
} from './productSummaryCache'

const sample = '這是一段商品摘要文字。'

describe('isFresh', () => {
  it('TTL 內為新鮮、超過為過期', () => {
    const now = 1_000_000_000
    expect(isFresh(now - (PRODUCT_CACHE_TTL_MS - 1), now)).toBe(true)
    expect(isFresh(now - (PRODUCT_CACHE_TTL_MS + 1), now)).toBe(false)
  })
})

describe('快取讀寫（記憶體 fallback）', () => {
  it('寫入後可依商品 id + 語氣讀回', async () => {
    await setCachedProductSummary('p-read', 'humorous', sample)
    const cached = await getCachedProductSummary('p-read', 'humorous')
    expect(cached).toBe(sample)
  })

  it('語氣不同視為不同快取', async () => {
    await setCachedProductSummary('p-tone', 'humorous', sample)
    expect(await getCachedProductSummary('p-tone', 'serious')).toBeNull()
  })

  it('沒寫過的商品讀不到', async () => {
    expect(await getCachedProductSummary('p-none', 'humorous')).toBeNull()
  })
})
