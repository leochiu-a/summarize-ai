// 商品摘要快取：同一商品在 TTL 內重開直接用快取、不重跑模型。
// 沿用 summaryCache 的策略（chrome.storage.local，測試 / demo 無 API 時退回記憶體），
// 但 key 以「商品 id + 語氣」區分，TTL 拉長（商品說明變動少）。

import type { ToneId } from './settings'

export const PRODUCT_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 小時
const KEY_PREFIX = 'product-summary:'

export interface CachedProductSummary {
  text: string
  ts: number
}

const memory = new Map<string, CachedProductSummary>()

// 語氣不同視為不同快取（同一商品換語氣要重跑）
function cacheKey(productId: string, tone: ToneId): string {
  return `${KEY_PREFIX}${productId}::${tone}`
}

function localStore(): chrome.storage.LocalStorageArea | null {
  return typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null
}

export function isFresh(ts: number, now: number = Date.now()): boolean {
  return now - ts < PRODUCT_CACHE_TTL_MS
}

export async function getCachedProductSummary(
  productId: string,
  tone: ToneId,
): Promise<string | null> {
  const key = cacheKey(productId, tone)
  const store = localStore()
  const entry = store
    ? ((await store.get(key))[key] as CachedProductSummary | undefined)
    : memory.get(key)
  if (!entry || !isFresh(entry.ts)) return null
  return entry.text
}

export async function setCachedProductSummary(
  productId: string,
  tone: ToneId,
  text: string,
): Promise<void> {
  const key = cacheKey(productId, tone)
  const entry: CachedProductSummary = { text, ts: Date.now() }
  const store = localStore()
  if (store) await store.set({ [key]: entry })
  else memory.set(key, entry)
}

export async function clearProductSummaryCache(): Promise<void> {
  memory.clear()
  const store = localStore()
  if (!store) return
  const all = await store.get()
  const keys = Object.keys(all).filter((k) => k.startsWith(KEY_PREFIX))
  if (keys.length) await store.remove(keys)
}
