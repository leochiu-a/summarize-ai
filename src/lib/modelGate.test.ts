import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  downloadGeminiNano,
  geminiNanoAvailabilitySync,
  onGateChange,
  refreshGeminiNano,
  resetGateForTest,
} from './modelGate'

// 造一個可控的 LanguageModel stub（gate 用它當 base-model probe）。
// create 時若有帶 monitor，立即 emit 一次 downloadprogress(loaded=1) 模擬下載完成。
function stubLanguageModel(opts: { availability?: string } = {}) {
  const calls = { create: 0, destroy: 0 }
  vi.stubGlobal('LanguageModel', {
    availability: async () => opts.availability ?? 'available',
    create: async (createOpts?: { monitor?: (m: unknown) => void }) => {
      calls.create += 1
      createOpts?.monitor?.({
        addEventListener: (t: string, cb: (e: { loaded: number }) => void) => {
          if (t === 'downloadprogress') cb({ loaded: 1 })
        },
      })
      return { destroy: () => (calls.destroy += 1) }
    },
  })
  return calls
}

afterEach(() => {
  resetGateForTest()
  vi.unstubAllGlobals()
})

describe('geminiNanoAvailabilitySync', () => {
  it('冷啟動（還沒 refresh）回 null', () => {
    expect(geminiNanoAvailabilitySync()).toBeNull()
  })
})

describe('refreshGeminiNano', () => {
  it('校正後同步快取可讀到 availability', async () => {
    stubLanguageModel({ availability: 'available' })
    expect(await refreshGeminiNano()).toBe('available')
    expect(geminiNanoAvailabilitySync()).toBe('available')
  })

  it('不支援 API（LanguageModel undefined）→ unavailable', async () => {
    vi.stubGlobal('LanguageModel', undefined)
    expect(await refreshGeminiNano()).toBe('unavailable')
  })

  it('availability throw 時視為 unavailable（不拋出）', async () => {
    vi.stubGlobal('LanguageModel', {
      availability: async () => {
        throw new Error('boom')
      },
    })
    expect(await refreshGeminiNano()).toBe('unavailable')
  })

  it('狀態有變動才通知 listeners', async () => {
    stubLanguageModel({ availability: 'downloadable' })
    const seen: string[] = []
    onGateChange((a) => seen.push(a))

    await refreshGeminiNano() // null → downloadable：通知
    await refreshGeminiNano() // downloadable → downloadable：不通知
    expect(seen).toEqual(['downloadable'])
  })
})

describe('onGateChange', () => {
  it('解除訂閱後不再收到通知', async () => {
    stubLanguageModel({ availability: 'available' })
    const seen: string[] = []
    const off = onGateChange((a) => seen.push(a))
    off()
    await refreshGeminiNano()
    expect(seen).toEqual([])
  })
})

describe('downloadGeminiNano', () => {
  it('觸發 create、完成後 destroy session，並校正快取為 available', async () => {
    // 先 available，代表下載完成後 refresh 會讀到 available
    const calls = stubLanguageModel({ availability: 'available' })
    await downloadGeminiNano()
    expect(calls.create).toBe(1)
    expect(calls.destroy).toBe(1)
    expect(geminiNanoAvailabilitySync()).toBe('available')
  })

  it('並發呼叫去重：只 create 一次', async () => {
    const calls = stubLanguageModel({ availability: 'available' })
    await Promise.all([downloadGeminiNano(), downloadGeminiNano(), downloadGeminiNano()])
    expect(calls.create).toBe(1)
  })

  it('下載完成廣播 available，讓訂閱者收到（就地復活）', async () => {
    stubLanguageModel({ availability: 'available' })
    const seen: string[] = []
    onGateChange((a) => seen.push(a))
    await downloadGeminiNano()
    expect(seen).toContain('available')
  })
})
