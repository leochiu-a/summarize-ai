import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetGateForTest, setGateAvailabilityForTest, refreshGeminiNano } from './lib/modelGate'
import { releaseReviewAssist } from './lib/reviewAssist'
import { startReviewPageToolbar } from './reviewPageToolbar'

// baseline session 的 stub：只需要數 create 被叫了幾次
function stubLanguageModel() {
  const calls = { create: 0 }
  const session = {
    promptStreaming: () => (async function* () {})(),
    clone: async () => session,
    destroy: () => {},
  }
  vi.stubGlobal('LanguageModel', {
    availability: async () => 'available',
    create: async () => {
      calls.create += 1
      return session
    },
  })
  return calls
}

afterEach(() => {
  releaseReviewAssist()
  resetGateForTest()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  window.history.replaceState({}, '', '/')
})

describe('startReviewPageToolbar 的預熱時機', () => {
  it('一進評論頁就預熱，不等 textarea 出現（cold start 藏進使用者打字的時間）', async () => {
    const lm = stubLanguageModel()
    setGateAvailabilityForTest('available')
    window.history.replaceState({}, '', '/zh-tw/order/comment/25KK268720222')

    // 頁面上還沒有任何 textarea——工具列本體還掛不上去，但預熱不該等它
    expect(document.querySelector('textarea')).toBeNull()
    startReviewPageToolbar()
    await Promise.resolve()

    expect(lm.create).toBe(1)
  })

  it('gate 未就緒時不硬預熱（沒有使用者手勢不觸發模型下載），下載完成才補上', async () => {
    const lm = stubLanguageModel()
    setGateAvailabilityForTest('downloadable')
    window.history.replaceState({}, '', '/zh-tw/order/comment/25KK268720222')

    startReviewPageToolbar()
    await Promise.resolve()
    expect(lm.create).toBe(0)

    // 使用者在工具列上同意並下載完成 → gate 廣播 available → 就地補上預熱
    await refreshGeminiNano()
    await Promise.resolve()
    expect(lm.create).toBe(1)
  })
})
