import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  getSettings,
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
})

describe('saveSettings', () => {
  it('部分更新會 merge，不影響其他欄位', async () => {
    await saveSettings({ tone: 'passionate' })
    const s = await saveSettings({ autoRun: true })
    expect(s).toEqual({ ...DEFAULT_SETTINGS, tone: 'passionate', autoRun: true })
  })

  it('連續快速呼叫不會互相覆蓋（同步 merge 在記憶體真相來源上）', async () => {
    // 模擬使用者連續點三個不同設定：不 await 前一個就送出下一個
    const p1 = saveSettings({ tone: 'passionate' })
    const p2 = saveSettings({ summaryType: 'tldr' })
    const p3 = saveSettings({ autoRun: true })
    await Promise.all([p1, p2, p3])

    const final = await getSettings()
    expect(final).toEqual({ tone: 'passionate', summaryType: 'tldr', autoRun: true })
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
