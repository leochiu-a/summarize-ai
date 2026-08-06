// 網站停用清單：使用者可以針對特定 hostname（例如 dev.kkday.com）或萬用字元 pattern
// （例如 *.sit.kkday.com）停用整組 AI 功能。存 chrome.storage.local，跟 settings.ts 同一套模式
// （同步真相來源 + onChanged 廣播），測試 / demo 無 API 時退回記憶體。
//
// 清單裡每一筆可以是：
// - 完整 hostname（大小寫不敏感）：只比對這一個 hostname，不含 apex domain ——
//   停用 dev.kkday.com 不會連帶停用 www.kkday.com 或 kkday.com 本身。
// - 帶 `*` 的 pattern：`*` 比對任意字元（含點），所以 `*.sit.kkday.com` 會吃掉
//   dev.sit.kkday.com、member.sit.kkday.com……任何 sit.kkday.com 底下的子網域，
//   但不含 sit.kkday.com 本身（`*.` 前面一定要有東西）。

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

function escapeRegExp(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
}

/** entry 是不是萬用字元 pattern（含 `*`），純字串判斷，UI 用來標示清單項目。 */
export function isPattern(entry: string): boolean {
  return entry.includes('*')
}

/** host 是否符合 entry（完整 hostname 直接相等；含 `*` 的 pattern 用 `*` 比對任意字元）。 */
export function hostMatchesPattern(host: string, entry: string): boolean {
  if (!isPattern(entry)) return host === entry
  const regex = new RegExp(`^${entry.split('*').map(escapeRegExp).join('.*')}$`)
  return regex.test(host)
}

/** 在清單裡找出第一筆會讓這個 host 被停用的 entry（可能是完整 hostname，也可能是 pattern）。 */
export function findMatchingEntry(hosts: string[], host: string): string | null {
  const h = normalizeHost(host)
  return hosts.find((entry) => hostMatchesPattern(h, entry)) ?? null
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

/** 目前停用清單（已排序、去重，完整 hostname 與 pattern 混在同一個陣列）。 */
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

/** content script 進入點用這個判斷要不要完全不掛載 AI 功能（含 pattern 比對）。 */
export async function isHostDisabled(host: string): Promise<boolean> {
  const hosts = await getDisabledHosts()
  return findMatchingEntry(hosts, host) !== null
}

/**
 * popup 用這個切換單一 entry（完整 hostname 或 pattern）的停用狀態，回傳更新後的完整清單。
 * 只新增 / 移除這個 entry 字面值本身，不會去展開或收斂 pattern 涵蓋到的其他 host。
 */
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
