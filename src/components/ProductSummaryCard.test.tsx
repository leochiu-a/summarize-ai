import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProductSummaryCard } from './ProductSummaryCard'
import { resetSettingsCache } from '../lib/settings'
import { clearProductSummaryCache } from '../lib/productSummaryCache'

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
  const calls = { create: 0 }
  vi.stubGlobal('LanguageModel', {
    availability: async () => availability,
    create: async () => {
      calls.create += 1
      return {
        promptStreaming: () => ({
          async *[Symbol.asyncIterator]() {
            yield MODEL_OUTPUT.slice(0, 6)
            yield MODEL_OUTPUT.slice(6)
          },
        }),
        destroy: () => {},
      }
    },
  })
  return calls
}

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  resetSettingsCache()
  await clearProductSummaryCache() // 快取以記憶體 fallback 保存，測試間需清掉
})

describe('ProductSummaryCard', () => {
  it('掛載後自動產生並顯示模型輸出', async () => {
    seedDescSection()
    stubLanguageModel()
    render(<ProductSummaryCard />)

    await waitFor(() => expect(screen.getByText(MODEL_OUTPUT)).toBeTruthy())
  })

  it('裝置無法使用模型時顯示錯誤', async () => {
    seedDescSection()
    stubLanguageModel('unavailable')
    render(<ProductSummaryCard />)

    await waitFor(() => expect(screen.getByText(/無法使用內建 AI 模型/)).toBeTruthy())
  })

  it('模型未下載時不自動跑，顯示按鈕；點擊後才產生', async () => {
    seedDescSection()
    const calls = stubLanguageModel('downloadable')
    render(<ProductSummaryCard />)

    // 掛載後應停在等待啟用狀態、還沒呼叫模型
    const activate = await screen.findByText(/點我產生商品重點摘要/)
    expect(calls.create).toBe(0)

    fireEvent.click(activate)
    await waitFor(() => expect(screen.getByText(MODEL_OUTPUT)).toBeTruthy())
    expect(calls.create).toBe(1)
  })
})
