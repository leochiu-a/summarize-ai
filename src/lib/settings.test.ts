import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  getSettings,
  getSettingsSync,
  resetSettingsCache,
  saveSettings,
  SUMMARY_TYPES,
  toneById,
  TONES,
} from './settings'

afterEach(() => {
  resetSettingsCache()
})

describe('預設值', () => {
  it('未設定時回傳預設值', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('預設是開啟、且沒有任何停用頁面（裝好就能用）', () => {
    expect(DEFAULT_SETTINGS.enabled).toBe(true)
    expect(DEFAULT_SETTINGS.disabledPages).toEqual([])
  })
})

describe('getSettingsSync', () => {
  it('冷啟動回預設值（呼叫端要先 await getSettings 補水）', () => {
    expect(getSettingsSync()).toEqual(DEFAULT_SETTINGS)
  })

  it('存檔後同步讀得到（content script 注入前的判斷靠這個）', async () => {
    await saveSettings({ enabled: false, disabledPages: ['kkday.com/product/123'] })
    expect(getSettingsSync().enabled).toBe(false)
    expect(getSettingsSync().disabledPages).toEqual(['kkday.com/product/123'])
  })

  it('回傳複本，外部改動不會污染快取', async () => {
    await getSettings()
    getSettingsSync().disabledPages.push('kkday.com/hacked')
    expect(getSettingsSync().disabledPages).toEqual([])
  })
})

describe('saveSettings', () => {
  it('部分更新會 merge，不影響其他欄位', async () => {
    await saveSettings({ tone: 'passionate' })
    const s = await saveSettings({ summaryType: 'tldr' })
    expect(s).toEqual({ ...DEFAULT_SETTINGS, tone: 'passionate', summaryType: 'tldr' })
  })

  it('連續快速呼叫不會互相覆蓋（同步 merge 在記憶體真相來源上）', async () => {
    // 模擬使用者連續點兩個不同設定：不 await 前一個就送出下一個
    const p1 = saveSettings({ tone: 'passionate' })
    const p2 = saveSettings({ summaryType: 'tldr' })
    await Promise.all([p1, p2])

    const final = await getSettings()
    expect(final).toEqual({ ...DEFAULT_SETTINGS, tone: 'passionate', summaryType: 'tldr' })
  })

  it('切總開關不影響停用清單與其他設定', async () => {
    await saveSettings({ disabledPages: ['kkday.com/product/1'], tone: 'cynical' })
    const s = await saveSettings({ enabled: false })
    expect(s).toEqual({
      enabled: false,
      disabledPages: ['kkday.com/product/1'],
      tone: 'cynical',
      summaryType: DEFAULT_SETTINGS.summaryType,
    })
  })
})

describe('storage 內容不可信', () => {
  // localStore() 每次呼叫才讀 chrome.storage，所以可以事後 stub 進去
  function stubStoredSettings(value: unknown) {
    const chromeStub = globalThis.chrome as unknown as Record<string, unknown>
    const original = chromeStub.storage
    chromeStub.storage = { local: { get: async () => ({ settings: value }) } }
    return () => {
      chromeStub.storage = original
    }
  }

  it('disabledPages 不是陣列時退回空陣列，不讓注入判斷炸掉', async () => {
    const restore = stubStoredSettings({ disabledPages: 'kkday.com/product/1' })
    resetSettingsCache()
    expect((await getSettings()).disabledPages).toEqual([])
    restore()
  })

  it('disabledPages 內的非字串項目被濾掉', async () => {
    const restore = stubStoredSettings({ disabledPages: ['kkday.com/a', null, 42, 'kkday.com/b'] })
    resetSettingsCache()
    expect((await getSettings()).disabledPages).toEqual(['kkday.com/a', 'kkday.com/b'])
    restore()
  })

  it('舊版設定（沒有 enabled 欄位）視為開啟，升級後小夥伴不會憑空消失', async () => {
    const restore = stubStoredSettings({ tone: 'gentle' })
    resetSettingsCache()
    const s = await getSettings()
    expect(s.enabled).toBe(true)
    expect(s.tone).toBe('gentle')
    restore()
  })

  it('只有明確的 false 才算關閉', async () => {
    const restore = stubStoredSettings({ enabled: false })
    resetSettingsCache()
    expect((await getSettings()).enabled).toBe(false)
    restore()
  })
})

describe('資料表', () => {
  it('每個語氣都有對應 emoji code 與口吻 prompt', () => {
    for (const t of TONES) {
      expect(t.code).toMatch(/^[0-9a-f_]+$/)
      expect(t.prompt.length).toBeGreaterThan(0)
    }
  })

  it('toneById 找不到時退回第一個語氣', () => {
    // @ts-expect-error 刻意傳入不存在的 id 測試 fallback
    expect(toneById('not-a-real-tone')).toBe(TONES[0])
  })

  it('摘要類型涵蓋 Summarizer API 的四種 type', () => {
    expect(SUMMARY_TYPES.map((s) => s.id)).toEqual(['key-points', 'tldr', 'teaser', 'headline'])
  })
})
