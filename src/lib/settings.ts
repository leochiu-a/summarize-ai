// 使用者設定：語氣、摘要類型、是否每頁自動摘要。
// 存 chrome.storage.local（跨分頁 / 重新整理），測試 / demo 無 API 時退回記憶體。

export type ToneId = 'humorous' | 'serious' | 'gentle' | 'passionate' | 'cynical' | 'literary'
export type SummaryTypeId = 'key-points' | 'tldr' | 'teaser' | 'headline'

export interface Settings {
  tone: ToneId
  summaryType: SummaryTypeId
  autoRun: boolean
}

// 語氣：emoji code（對應 Google Noto assets/emoji/<code>.svg|.webp）+ 標籤 + 餵給模型的口吻指示
export const TONES: { id: ToneId; code: string; label: string; prompt: string }[] = [
  { id: 'humorous', code: '1f61c', label: '幽默', prompt: '請用輕鬆幽默、偶爾吐槽的口吻整理重點，讓人會心一笑。' },
  { id: 'serious', code: '1f9d0', label: '正經', prompt: '請用專業、客觀中立的口吻整理重點。' },
  { id: 'gentle', code: '1f917', label: '溫柔', prompt: '請用溫柔親切、鼓勵的口吻整理重點。' },
  { id: 'passionate', code: '1f525', label: '熱血', prompt: '請用熱血、充滿energy的口吻整理重點，語氣要有感染力。' },
  { id: 'cynical', code: '1f971', label: '厭世', prompt: '請用厭世、淡定、有點無所謂的口吻整理重點。' },
  { id: 'literary', code: '1f338', label: '文青', prompt: '請用感性、文藝的口吻整理重點。' },
]

// 摘要類型：對應 Summarizer API 的 type
export const SUMMARY_TYPES: { id: SummaryTypeId; label: string; hint: string }[] = [
  { id: 'key-points', label: '重點', hint: '條列式重點清單' },
  { id: 'tldr', label: '懶人包', hint: '極短的一句話總結' },
  { id: 'teaser', label: '開場白', hint: '勾起興趣的引言' },
  { id: 'headline', label: '標題', hint: '一句話標題' },
]

export const DEFAULT_SETTINGS: Settings = {
  tone: 'humorous',
  summaryType: 'key-points',
  autoRun: false,
}

const STORAGE_KEY = 'settings'

// 同步的記憶體真相來源：saveSettings 直接 merge 在這上面，避免多次快速寫入互相覆蓋。
// storage.onChanged 監聽讓 current 在跨 context（popup 寫、content 讀）時保持新鮮。
let current: Settings = { ...DEFAULT_SETTINGS }
let loaded = false

function localStore(): chrome.storage.LocalStorageArea | null {
  return typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null
}

// 模組載入時就掛上跨 context 同步（popup 存檔 → content script 的 current 立即更新）
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) {
      current = { ...DEFAULT_SETTINGS, ...(changes[STORAGE_KEY].newValue as Partial<Settings>) }
      loaded = true
    }
  })
}

export async function getSettings(): Promise<Settings> {
  if (!loaded) {
    const store = localStore()
    if (store) {
      const res = await store.get(STORAGE_KEY)
      current = { ...DEFAULT_SETTINGS, ...(res[STORAGE_KEY] as Partial<Settings> | undefined) }
    }
    loaded = true
  }
  return { ...current }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  if (!loaded) await getSettings() // 確保 current 已從 storage 補水
  current = { ...current, ...patch } // 同步 merge，杜絕並發覆蓋
  const store = localStore()
  if (store) await store.set({ [STORAGE_KEY]: current })
  return { ...current }
}

// 訂閱設定變更（popup 存檔後，其他頁面即時同步）
export function onSettingsChanged(cb: (settings: Settings) => void): () => void {
  const store = localStore()
  if (!store || !chrome.storage?.onChanged) return () => {}
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[STORAGE_KEY]) {
      cb({ ...DEFAULT_SETTINGS, ...(changes[STORAGE_KEY].newValue as Partial<Settings>) })
    }
  }
  chrome.storage.onChanged.addListener(handler)
  return () => chrome.storage.onChanged.removeListener(handler)
}

// 測試用：重設記憶體真相來源
export function resetSettingsCache(): void {
  current = { ...DEFAULT_SETTINGS }
  loaded = false
}

export function toneById(id: ToneId) {
  return TONES.find((t) => t.id === id) ?? TONES[0]
}
