import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConsentBuddy } from './ConsentBuddy'
import { resetGateForTest, setGateAvailabilityForTest } from '../lib/modelGate'

// 可控的 LanguageModel stub（gate 的 base-model probe + 下載觸發）
function stubLanguageModel(availability = 'available') {
  const calls = { create: 0, destroy: 0 }
  vi.stubGlobal('LanguageModel', {
    availability: async () => availability,
    create: async (opts?: { monitor?: (m: unknown) => void }) => {
      calls.create += 1
      opts?.monitor?.({
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
  cleanup()
  resetGateForTest()
  vi.unstubAllGlobals()
})

describe('ConsentBuddy（同意才下載）', () => {
  it('模型未就緒 → 顯示同意提示與「下載並啟用」按鈕', () => {
    setGateAvailabilityForTest('downloadable') // 同步初值 → 直接進 consent，零閃現
    render(<ConsentBuddy />)

    expect(screen.getByText(/要現在下載並啟用嗎/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '下載並啟用' })).toBeTruthy()
  })

  it('點「下載並啟用」→ 觸發下載，完成後顯示已就緒', async () => {
    setGateAvailabilityForTest('downloadable')
    const calls = stubLanguageModel('available') // 下載完成後 refresh 讀到 available
    render(<ConsentBuddy />)

    fireEvent.click(screen.getByRole('button', { name: '下載並啟用' }))

    await waitFor(() => expect(screen.getByText(/下載完成，已就緒/)).toBeTruthy())
    expect(calls.create).toBe(1)
    expect(calls.destroy).toBe(1)
  })

  it('模型已就緒 → 不擋，直接交棒（onReady 被呼叫、自己不渲染提示）', async () => {
    setGateAvailabilityForTest('available')
    const onReady = vi.fn()
    render(<ConsentBuddy onReady={onReady} />)

    await waitFor(() => expect(onReady).toHaveBeenCalled())
    expect(screen.queryByText(/要現在下載並啟用嗎/)).toBeNull()
  })

  it('裝置不支援（unavailable）→ 顯示錯誤，不顯示下載按鈕', () => {
    setGateAvailabilityForTest('unavailable')
    render(<ConsentBuddy />)

    expect(screen.getByText(/無法使用內建 AI 模型/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '下載並啟用' })).toBeNull()
  })
})
