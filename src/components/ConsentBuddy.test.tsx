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

  it('點「下載並啟用」→ 觸發下載，完成後顯示已就緒 +「開始使用」按鈕，點它才交棒', async () => {
    setGateAvailabilityForTest('downloadable')
    const calls = stubLanguageModel('available') // 下載完成後 refresh 讀到 available
    const onReady = vi.fn()
    render(<ConsentBuddy onReady={onReady} />)

    fireEvent.click(screen.getByRole('button', { name: '下載並啟用' }))

    // 下載完成：顯示已就緒 + 明確的「開始使用」按鈕（不再靠隱晦的點頭像）
    await waitFor(() => expect(screen.getByText(/下載完成，已就緒/)).toBeTruthy())
    expect(calls.create).toBe(1)
    expect(calls.destroy).toBe(1)
    const startBtn = screen.getByRole('button', { name: '開始使用' })
    expect(onReady).not.toHaveBeenCalled() // 還沒點，不交棒

    fireEvent.click(startBtn)
    expect(onReady).toHaveBeenCalled() // 點「開始使用」才交棒
  })

  it('模型已就緒 → 不擋，直接交棒（onReady 被呼叫、自己不渲染提示）', async () => {
    setGateAvailabilityForTest('available')
    const onReady = vi.fn()
    render(<ConsentBuddy onReady={onReady} />)

    await waitFor(() => expect(onReady).toHaveBeenCalled())
    expect(screen.queryByText(/要現在下載並啟用嗎/)).toBeNull()
  })

  it('裝置不支援（unavailable）→ 預設收合不擋畫面，點頭像才顯示錯誤', () => {
    setGateAvailabilityForTest('unavailable')
    render(<ConsentBuddy />)

    // 沒有行動可做的錯誤不該自動展開擋住頁面
    expect(screen.queryByText(/無法使用內建 AI 模型/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Buddy AI' }))
    expect(screen.getByText(/無法使用內建 AI 模型/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '下載並啟用' })).toBeNull()
  })

  it('錯誤泡泡可以關掉，也能攤開偵測細節', () => {
    setGateAvailabilityForTest('unavailable')
    render(<ConsentBuddy />)

    fireEvent.click(screen.getByRole('button', { name: 'Buddy AI' }))
    fireEvent.click(screen.getByRole('button', { name: '偵測細節' }))
    expect(screen.getByText('LanguageModel API')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '關閉' }))
    expect(screen.queryByText(/無法使用內建 AI 模型/)).toBeNull()
  })

  it('http 頁面（非安全內容）→ 說「這個網站不適用」，不要怪到裝置頭上', async () => {
    vi.stubGlobal('isSecureContext', false)
    vi.stubGlobal('LanguageModel', undefined)
    render(<ConsentBuddy />)

    // 一樣預設收合（不擋畫面），點頭像才看到說明
    await waitFor(() => expect(screen.getByRole('button', { name: 'Buddy AI' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Buddy AI' }))

    expect(screen.getByText('這個網站不適用')).toBeTruthy()
    expect(screen.getByText(/不是 HTTPS/)).toBeTruthy()
    expect(screen.queryByText(/這台裝置/)).toBeNull()
  })

  it('同意提示可以關掉（點頭像收合），不會被 state 重新打開', () => {
    setGateAvailabilityForTest('downloadable')
    render(<ConsentBuddy />)

    expect(screen.getByText(/要現在下載並啟用嗎/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '關閉' }))
    expect(screen.queryByText(/要現在下載並啟用嗎/)).toBeNull()
  })
})
