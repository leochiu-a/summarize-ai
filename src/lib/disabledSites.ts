// 網站停用清單：使用者可以針對特定 hostname（例如 dev.kkday.com）停用整組 AI 功能。
// 存 chrome.storage.local，跟 settings.ts 同一套模式（同步真相來源 + onChanged 廣播），
// 測試 / demo 無 API 時退回記憶體。
//
// 比對粒度是完整 hostname（大小寫不敏感），不是 apex domain：停用 dev.kkday.com
// 不會連帶停用 www.kkday.com 或 kkday.com 本身。

const STORAGE_KEY = 'disabledHosts'

let current: string[] = []
let loaded = false

function localStore(): chrome.storage.LocalStorageArea | null {
  return typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase()
}

function normalizeList(hosts: string[]): string[] {
  return Array.from(new Set(hosts.map(normalizeHost).filter(Boolean))).sort()
}

// 模組載入時掛上跨 context 同步（popup 存檔 → content script 立即讀到最新清單）
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) {
      current = normalizeList((changes[STORAGE_KEY].newValue as string[] | undefined) ?? [])
      loaded = true
    }
  })
}

/** 目前停用清單（已排序、去重的 hostname 陣列）。 */
export async function getDisabledHosts(): Promise<string[]> {
  if (!loaded) {
    const store = localStore()
    if (store) {
      const res = await store.get(STORAGE_KEY)
      current = normalizeList((res[STORAGE_KEY] as string[] | undefined) ?? [])
    }
    loaded = true
  }
  return [...current]
}

/** content script 進入點用這個判斷要不要完全不掛載 AI 功能。 */
export async function isHostDisabled(host: string): Promise<boolean> {
  const hosts = await getDisabledHosts()
  return hosts.includes(normalizeHost(host))
}

/** popup 用這個切換單一 hostname 的停用狀態，回傳更新後的完整清單。 */
export async function setHostDisabled(host: string, disabled: boolean): Promise<string[]> {
  if (!loaded) await getDisabledHosts() // 確保 current 已從 storage 補水
  const h = normalizeHost(host)
  current = disabled ? normalizeList([...current, h]) : current.filter((x) => x !== h)
  const store = localStore()
  if (store) await store.set({ [STORAGE_KEY]: current })
  return [...current]
}

/** 訂閱停用清單變更（popup 存檔後，其他 popup 分頁即時同步）。 */
export function onDisabledHostsChanged(cb: (hosts: string[]) => void): () => void {
  const store = localStore()
  if (!store || !chrome.storage?.onChanged) return () => {}
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[STORAGE_KEY]) {
      cb(normalizeList((changes[STORAGE_KEY].newValue as string[] | undefined) ?? []))
    }
  }
  chrome.storage.onChanged.addListener(handler)
  return () => chrome.storage.onChanged.removeListener(handler)
}

// 測試用：重設記憶體真相來源
export function resetDisabledHostsForTest(): void {
  current = []
  loaded = false
}
