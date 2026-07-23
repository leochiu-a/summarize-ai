// 頁面摘要快取：同一個網址在 TTL 內重開，直接用快取、不重跑模型。
// 優先用 chrome.storage.local（跨分頁、跨重新整理保存）；測試 / demo 無此 API 時退回記憶體。

export const CACHE_TTL_MS = 30 * 60 * 1000 // 半小時
const KEY_PREFIX = 'summary:'

export interface CachedSummary {
  markdown: string
  title: string
  ts: number
}

const memory = new Map<string, CachedSummary>()

// 以「來源 + 路徑 + query」當 key（忽略 hash，同頁的錨點不算不同頁）
function pageKey(): string {
  return `${KEY_PREFIX}${location.origin}${location.pathname}${location.search}`
}

function localStore(): chrome.storage.LocalStorageArea | null {
  return typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null
}

export function isFresh(ts: number, now: number = Date.now()): boolean {
  return now - ts < CACHE_TTL_MS
}

export async function getCachedSummary(): Promise<CachedSummary | null> {
  const key = pageKey()
  const store = localStore()
  const entry = store ? ((await store.get(key))[key] as CachedSummary | undefined) : memory.get(key)
  if (!entry || !isFresh(entry.ts)) return null
  return entry
}

export async function setCachedSummary(markdown: string, title: string): Promise<void> {
  const key = pageKey()
  const entry: CachedSummary = { markdown, title, ts: Date.now() }
  const store = localStore()
  if (store) await store.set({ [key]: entry })
  else memory.set(key, entry)
}

export async function clearSummaryCache(): Promise<void> {
  memory.clear()
  const store = localStore()
  if (!store) return
  const all = await store.get()
  const keys = Object.keys(all).filter((k) => k.startsWith(KEY_PREFIX))
  if (keys.length) await store.remove(keys)
}
