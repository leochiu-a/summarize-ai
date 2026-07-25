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

    await waitFor(() => expect(screen.getByText(/摘要失敗/)).toBeTruthy())
  })

  // 「模型未下載就先問同意」的把關已移到注入層（productPageSummary 的 gate）：
  // downloadable 時卡片根本不會被注入。所以卡片本身的契約是「被 render＝gate 已通過」，
  // 掛載即以 userInitiated 直接產生（不再自己顯示 needs-activation 按鈕）。
  it('卡片被 render 即代表 gate 已放行，掛載即直接產生（不需再點按鈕）', async () => {
    seedDescSection()
    const calls = stubLanguageModel('available')
    render(<ProductSummaryCard />)

    await waitFor(() => expect(screen.getByText(MODEL_OUTPUT)).toBeTruthy())
    expect(calls.create).toBe(1)
    // 不再出現「點我產生」按鈕（那道把關已移到注入層）
    expect(screen.queryByText(/點我產生商品重點摘要/)).toBeNull()
  })
})
