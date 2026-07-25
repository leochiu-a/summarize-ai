import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ReviewBuddy } from './ReviewBuddy'
import { resetSettingsCache } from '../lib/settings'

// 依序吐出 chunks 後結束的串流（Rewriter 用）
function chunkStream(chunks: string[]): () => AsyncIterable<string> {
  return async function* () {
    for (const c of chunks) yield c
  }
}

// 可控的 Rewriter stub：記錄 create 次數，rewriteStreaming 吐出指定內容
function stubRewriter(streamFactory: () => AsyncIterable<string>) {
  const calls = { create: 0 }
  vi.stubGlobal('Rewriter', {
    availability: async () => 'available',
    create: async () => {
      calls.create += 1
      return { rewriteStreaming: () => streamFactory(), destroy: () => {} }
    },
  })
  return calls
}

// 評論頁 + 輸入框
function seedReviewPage(): HTMLTextAreaElement {
  window.history.replaceState({}, '', '/zh-tw/order/comment/25KK268720222')
  const el = document.createElement('textarea')
  el.placeholder = '你覺得這次體驗如何呢？請告訴我們'
  document.body.appendChild(el)
  return el
}

// 設定輸入框文字並派發 input（模擬使用者打字）
function typeInto(el: HTMLTextAreaElement, text: string) {
  el.value = text
  fireEvent.input(el)
}

const avatar = () => screen.getByRole('button', { name: 'Buddy AI' })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.innerHTML = ''
  window.history.replaceState({}, '', '/')
  resetSettingsCache()
})

describe('ReviewBuddy 進頁引導分段', () => {
  it('寫不夠字時不出現「幫我想想」按鈕', async () => {
    vi.useFakeTimers()
    seedReviewPage()
    render(<ReviewBuddy />)
    const el = document.querySelector('textarea')!
    typeInto(el, '還好') // 2 字，低於門檻
    act(() => vi.advanceTimersByTime(500)) // 過 debounce

    expect(screen.queryByRole('button', { name: '幫我想想怎麼寫' })).toBeNull()
  })

  it('寫夠字（≥45）才出現「幫我想想」按鈕', () => {
    vi.useFakeTimers()
    seedReviewPage()
    render(<ReviewBuddy />)
    const el = document.querySelector('textarea')!
    typeInto(el, '這'.repeat(50)) // 50 字，達門檻
    act(() => vi.advanceTimersByTime(500)) // 過 debounce，分段同步更新

    expect(screen.getByRole('button', { name: '幫我想想怎麼寫' })).toBeTruthy()
  })
})

describe('ReviewBuddy 潤飾流程', () => {
  it('點「幫我想想」→ 用 Rewriter 潤飾，顯示結果與「套用/重新潤飾」，且不自動寫回', async () => {
    seedReviewPage()
    const calls = stubRewriter(chunkStream(['潤飾後：', '這趟體驗很棒，推薦給大家']))
    render(<ReviewBuddy />)
    const el = document.querySelector('textarea')! as HTMLTextAreaElement
    const original = '這趟體驗蠻好的推薦啦'.repeat(5)
    typeInto(el, original)

    await waitFor(() => screen.getByRole('button', { name: '幫我想想怎麼寫' }))
    fireEvent.click(screen.getByRole('button', { name: '幫我想想怎麼寫' }))

    // 顯示潤飾結果
    await screen.findByText(/這趟體驗很棒，推薦給大家/)
    expect(calls.create).toBe(1)
    // 待確認：出現套用 / 重新潤飾
    expect(screen.getByRole('button', { name: '套用到評論' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '重新潤飾' })).toBeTruthy()
    // 關鍵：還沒按套用前，輸入框「不」被改動
    expect(el.value).toBe(original)
  })

  it('按「套用到評論」才把結果寫回輸入框', async () => {
    seedReviewPage()
    stubRewriter(chunkStream(['潤飾成品文字']))
    render(<ReviewBuddy />)
    const el = document.querySelector('textarea')! as HTMLTextAreaElement
    typeInto(el, '原始'.repeat(30)) // 60 字，穩過門檻

    await waitFor(() => screen.getByRole('button', { name: '幫我想想怎麼寫' }))
    fireEvent.click(screen.getByRole('button', { name: '幫我想想怎麼寫' }))
    await screen.findByText(/潤飾成品文字/)

    fireEvent.click(screen.getByRole('button', { name: '套用到評論' }))
    await waitFor(() => expect(el.value).toBe('潤飾成品文字'))
  })
})

describe('ReviewBuddy 收合', () => {
  it('待確認時點頭像 → 直接關掉泡泡，不彈回引導提示', async () => {
    seedReviewPage()
    stubRewriter(chunkStream(['潤飾後的內容']))
    render(<ReviewBuddy />)
    const el = document.querySelector('textarea')! as HTMLTextAreaElement
    typeInto(el, '原始'.repeat(30))

    await waitFor(() => screen.getByRole('button', { name: '幫我想想怎麼寫' }))
    fireEvent.click(screen.getByRole('button', { name: '幫我想想怎麼寫' }))
    await screen.findByText(/潤飾後的內容/)

    // 點頭像 → 泡泡收起：結果與標題都消失，且不會冒出引導提示
    fireEvent.click(avatar())
    await waitFor(() => expect(screen.queryByText(/潤飾後的內容/)).toBeNull())
    expect(screen.queryByText('幫你潤飾評論')).toBeNull()
    expect(screen.queryByText(/這次體驗如何/)).toBeNull()
    expect(screen.queryByText(/寫得很棒/)).toBeNull()
  })
})

describe('ReviewBuddy 快取：原文沒變不重跑', () => {
  it('原文相同再次潤飾 → 直接用上次結果，不重呼叫模型', async () => {
    seedReviewPage()
    const calls = stubRewriter(chunkStream(['第一次潤飾結果']))
    render(<ReviewBuddy />)
    const el = document.querySelector('textarea')! as HTMLTextAreaElement
    typeInto(el, '同一段原文'.repeat(12)) // 60 字，穩過門檻

    await waitFor(() => screen.getByRole('button', { name: '幫我想想怎麼寫' }))
    fireEvent.click(screen.getByRole('button', { name: '幫我想想怎麼寫' }))
    await screen.findByText(/第一次潤飾結果/)
    expect(calls.create).toBe(1)

    // 原文沒變，點「重新潤飾」→ 用快取，不重跑
    fireEvent.click(screen.getByRole('button', { name: '重新潤飾' }))
    await waitFor(() => screen.getByText(/第一次潤飾結果/))
    expect(calls.create).toBe(1) // 沒有增加
  })
})
