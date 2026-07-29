import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProductSummaryCard } from './ProductSummaryCard'
import { resetSettingsCache } from '../lib/settings'
import { releaseProductSummary } from '../lib/productSummary'
import {
  clearProductSummaryCache,
  setCachedProductSummary,
} from '../lib/productSummaryCache'

const DESC =
  '通行證涵蓋多處必訪景點，包括甘川洞文化村、札嘎其市場、海雲台、廣安大橋，讓你深入探索釜山的文化與現代魅力，並享有多處景點與商店的專屬折扣與入場優惠，省錢又盡興。'

// 在頁面塞一個商品說明區塊，讓 hook 抽得到內文（需超過 MIN_CHARS 門檻）
function seedDescSection() {
  document.body.innerHTML = `
    <div id="product-info-sec" class="info-section">
      <h2 class="info-title">商品說明</h2>
      <div class="info-sec-collapsable"><p>${DESC}</p><p>${DESC}</p></div>
    </div>`
}

// ⚠️ 測試階段：extension 目前用最精簡串流呼叫，模型原始輸出直接顯示。
// LanguageModel stub：promptStreaming 分兩塊吐出固定文字，並記錄 create 次數
const MODEL_OUTPUT = '釜山通行證：一票暢遊多個景點，享折扣與交通優惠。'
function stubLanguageModel(availability: Availability = 'available') {
  const calls = { create: 0, prompt: 0 }
  vi.stubGlobal('LanguageModel', {
    availability: async () => availability,
    create: async () => {
      calls.create += 1
      const session: Record<string, unknown> = {
        promptStreaming: () => {
          calls.prompt += 1
          return {
            async *[Symbol.asyncIterator]() {
              yield MODEL_OUTPUT.slice(0, 6)
              yield MODEL_OUTPUT.slice(6)
            },
          }
        },
        clone: async () => session,
        destroy: () => {},
      }
      return session
    },
  })
  return calls
}

const activateBtn = () => screen.getByRole('button', { name: '產生 AI 摘要' })

afterEach(async () => {
  cleanup()
  releaseProductSummary() // 預熱的 session 是模組級的，測試間要收掉
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  resetSettingsCache()
  await clearProductSummaryCache() // 快取以記憶體 fallback 保存，測試間需清掉
})

describe('ProductSummaryCard', () => {
  it('掛載只顯示按鈕、不推論；按下按鈕才產生摘要', async () => {
    seedDescSection()
    const calls = stubLanguageModel()
    render(<ProductSummaryCard />)

    // 掛載：出現邀請與按鈕，模型沒有被問過（只在背景預熱）
    await waitFor(() => expect(activateBtn()).toBeTruthy())
    expect(calls.prompt).toBe(0)
    expect(screen.queryByText(MODEL_OUTPUT)).toBeNull()

    fireEvent.click(activateBtn())

    await waitFor(() => expect(screen.getByText(MODEL_OUTPUT)).toBeTruthy())
    expect(calls.prompt).toBe(1)
  })

  it('掛載時預先載入模型（create 過但還沒提問）', async () => {
    seedDescSection()
    const calls = stubLanguageModel()
    render(<ProductSummaryCard />)

    await waitFor(() => expect(calls.create).toBe(1)) // 預熱：session 已建好
    expect(calls.prompt).toBe(0) // 但還沒推論
    expect(activateBtn()).toBeTruthy()
  })

  it('已有快取 → 掛載直接顯示上次結果，不出現按鈕、也不預熱', async () => {
    seedDescSection()
    window.history.replaceState({}, '', '/zh-tw/product/12319')
    await setCachedProductSummary('12319', 'humorous', '快取的商品摘要')
    const calls = stubLanguageModel()

    render(<ProductSummaryCard />)

    await waitFor(() => expect(screen.getByText('快取的商品摘要')).toBeTruthy())
    expect(screen.queryByRole('button', { name: '產生 AI 摘要' })).toBeNull()
    expect(screen.getByText('快取')).toBeTruthy()
    expect(calls.create).toBe(0) // 有快取就不用載模型
    window.history.replaceState({}, '', '/')
  })

  it('生成過程出錯（create throw）時顯示錯誤', async () => {
    // 可用性把關已移到注入層 gate（unavailable 時卡片根本不會被注入），卡片自己不再判 availability。
    // 這裡驗證真實的兜底路徑：create 失敗 → catch → 顯示錯誤。
    seedDescSection()
    vi.stubGlobal('LanguageModel', {
      availability: async () => 'available',
      create: async () => {
        throw new Error('模型初始化失敗')
      },
    })
    render(<ProductSummaryCard />)
    fireEvent.click(activateBtn())

    await waitFor(() => expect(screen.getByText(/摘要失敗/)).toBeTruthy())
  })
})
