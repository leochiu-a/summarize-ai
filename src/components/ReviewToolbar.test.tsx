import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ReviewToolbar } from './ReviewToolbar'
import { setGateAvailabilityForTest, resetGateForTest } from '../lib/modelGate'
import { releaseReviewAssist } from '../lib/reviewAssist'
import { resetSettingsCache } from '../lib/settings'

// 依序吐出 chunks 後結束的串流
async function* chunkStream(chunks: string[]): AsyncIterable<string> {
  for (const c of chunks) yield c
}

// Prompt API stub（一般使用者的真實情況：Rewriter 不存在，四個動作全走這條）
function stubLanguageModel(chunks: string[] = ['AI 的產出']) {
  const calls = { create: 0, prompts: [] as string[] }
  const session = {
    promptStreaming: (p: string) => {
      calls.prompts.push(p)
      return chunkStream(chunks)
    },
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

// 評論頁 + 輸入框（工具列注入的目標）
function seedReviewPage(value = ''): HTMLTextAreaElement {
  window.history.replaceState({}, '', '/zh-tw/order/comment/25KK268720222')
  const el = document.createElement('textarea')
  el.placeholder = '你覺得這次體驗如何呢？請告訴我們'
  el.maxLength = 900
  el.value = value
  document.body.appendChild(el)
  return el
}

const btn = (name: string) => screen.getByRole('button', { name })

afterEach(() => {
  cleanup()
  releaseReviewAssist()
  resetGateForTest()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  window.history.replaceState({}, '', '/')
  resetSettingsCache()
})

describe('模型 gate', () => {
  it('未就緒時只給一顆「啟用」按鈕，不直接開始下載', () => {
    stubLanguageModel()
    setGateAvailabilityForTest('downloadable')
    seedReviewPage()
    render(<ReviewToolbar />)

    expect(btn('讓 AI 幫你寫這則評論')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '潤飾這段' })).toBeNull()
  })

  it('裝置不支援時只留一行說明，不擋著使用者寫評論', () => {
    setGateAvailabilityForTest('unavailable')
    seedReviewPage()
    const { container } = render(<ReviewToolbar />)

    expect(container.querySelector('.rt-notice')).toBeTruthy()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})

describe('按鈕開關跟著使用者寫了多少字', () => {
  it('一個字都還沒寫：只有「給我開頭」能按，點潤飾會說明原因', () => {
    stubLanguageModel()
    setGateAvailabilityForTest('available')
    seedReviewPage('')
    render(<ReviewToolbar />)

    expect(btn('寫不出來？給我開頭').getAttribute('aria-disabled')).toBe('false')
    expect(btn('潤飾這段').getAttribute('aria-disabled')).toBe('true')

    fireEvent.click(btn('潤飾這段'))
    expect(screen.getByText(/先寫幾句你的心得/)).toBeTruthy()
  })

  it('寫了幾句：潤飾 / 擴寫打開，「給我開頭」關掉', () => {
    stubLanguageModel()
    setGateAvailabilityForTest('available')
    const el = seedReviewPage()
    render(<ReviewToolbar />)

    el.value = '這趟機場交通很順，車廂也乾淨，下次還會再買'
    fireEvent.input(el)

    expect(btn('潤飾這段').getAttribute('aria-disabled')).toBe('false')
    expect(btn('再多寫一點').getAttribute('aria-disabled')).toBe('false')
    expect(btn('寫不出來？給我開頭').getAttribute('aria-disabled')).toBe('true')
  })
})

describe('產出要按「套用」才寫回輸入框', () => {
  it('串流完只顯示在結果面板，輸入框原封不動；按套用才寫回', async () => {
    stubLanguageModel(['潤飾後的', '完整版本'])
    setGateAvailabilityForTest('available')
    const el = seedReviewPage('這趟機場交通很順，車廂也乾淨，下次還會再買')
    render(<ReviewToolbar />)

    fireEvent.click(btn('潤飾這段'))
    await waitFor(() => expect(screen.getByText('潤飾後的完整版本')).toBeTruthy())
    expect(el.value).toBe('這趟機場交通很順，車廂也乾淨，下次還會再買') // 還沒套用，一個字都沒動

    fireEvent.click(btn('套用到評論'))
    expect(el.value).toBe('潤飾後的完整版本')
  })

  it('「不用了」收掉結果，輸入框仍是原文', async () => {
    stubLanguageModel(['另一個版本'])
    setGateAvailabilityForTest('available')
    const el = seedReviewPage('這趟機場交通很順，車廂也乾淨，下次還會再買')
    render(<ReviewToolbar />)

    fireEvent.click(btn('潤飾這段'))
    await waitFor(() => expect(screen.getByText('另一個版本')).toBeTruthy())
    fireEvent.click(btn('不用了'))

    expect(screen.queryByText('另一個版本')).toBeNull()
    expect(el.value).toBe('這趟機場交通很順，車廂也乾淨，下次還會再買')
  })
})

describe('換個語氣', () => {
  it('點開才出現語氣選項，選了才跑，且送進模型的是選的那個語氣', async () => {
    const lm = stubLanguageModel(['文青版'])
    setGateAvailabilityForTest('available')
    seedReviewPage('這趟機場交通很順，車廂也乾淨，下次還會再買')
    render(<ReviewToolbar />)

    expect(screen.queryByRole('button', { name: /文青/ })).toBeNull()
    fireEvent.click(btn('換個語氣'))
    fireEvent.click(screen.getByRole('button', { name: /文青/ }))

    await waitFor(() => expect(screen.getByText('文青版')).toBeTruthy())
    expect(lm.prompts[0]).toContain('感性、帶點畫面感') // literary 的語氣描述
    expect(lm.prompts[0]).toContain('內容、事實、評價一字不改')
  })
})
