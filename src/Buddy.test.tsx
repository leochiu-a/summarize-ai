import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Buddy } from './Buddy'
import { resetGateForTest, setGateAvailabilityForTest } from './lib/modelGate'
import { resetSettingsCache, saveSettings } from './lib/settings'
import { releaseSummarizer } from './lib/summarizer'
import { clearSummaryCache } from './lib/summaryCache'
import { releaseWorthIt } from './lib/worthIt'
import { clearWorthItCache } from './lib/worthItCache'

// 用一段夠長的文章塞進頁面，讓 extractContent 抽得到內容（需超過長度門檻）
function seedArticle() {
  const p =
    '這是一段夠長的測試內文，用來讓內容擷取器判定這個頁面確實有值得摘要的文字段落，' +
    '需要足夠的字數、標點與句子結構才能通過 Readability 與長度門檻的檢查，' +
    '因此這裡刻意寫得長一點，模擬真實文章裡連貫敘述的樣子。'
  const paras = Array.from({ length: 4 }, () => `<p>${p}</p>`).join('')
  document.body.insertAdjacentHTML('afterbegin', `<article><h1>測試文章</h1>${paras}</article>`)
}

// 建立可控的 Summarizer stub：streamFactory 決定串流吐出什麼，並記錄呼叫次數。
// create = 建立實例（預熱也算），summarize = 真的送去推論。
function stubSummarizer(streamFactory: () => AsyncIterable<string>) {
  const calls = { create: 0, summarize: 0 }
  vi.stubGlobal('Summarizer', {
    availability: async () => 'available',
    create: async () => {
      calls.create += 1
      return {
        summarizeStreaming: () => {
          calls.summarize += 1
          return streamFactory()
        },
        destroy: () => {},
      }
    },
  })
  return calls
}

// 永不吐出的串流 → 停在 thinking 狀態
const pendingStream = (): AsyncIterable<string> => ({
  [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<string>>(() => {}) }),
})

// 依序吐出 chunks 後結束 → 走到 done
function chunkStream(chunks: string[]): () => AsyncIterable<string> {
  return async function* () {
    for (const c of chunks) yield c
  }
}

// 頭像不再有依模式變化的提示文字，統一用固定 aria-label 定位（商品頁 / 一般頁同一顆）
const avatar = () => screen.getByRole('button', { name: 'Buddy AI' })
const productAvatar = avatar

// 泡泡裡的 CTA：現在點頭像只展開泡泡 + 預熱模型，要再按這顆按鈕才真的跑
const summaryCta = () => screen.getByRole('button', { name: '幫我摘要這頁' })
const worthCta = () => screen.getByRole('button', { name: '幫我看值不值得' })

// 兩段式觸發的完整動作：點頭像展開 → 按 CTA 開始
async function startSummary() {
  fireEvent.click(avatar())
  fireEvent.click(await screen.findByRole('button', { name: '幫我摘要這頁' }))
}
async function startWorth() {
  fireEvent.click(productAvatar())
  fireEvent.click(await screen.findByRole('button', { name: '幫我看值不值得' }))
}

// 建立可控的 LanguageModel stub（值不值得買用 Prompt API）。
// create = 建立 baseline session（預熱也算），prompt = 真的送去推論。
function stubLanguageModel(streamFactory: () => AsyncIterable<string>) {
  const calls = { create: 0, prompt: 0 }
  vi.stubGlobal('LanguageModel', {
    availability: async () => 'available',
    create: async () => {
      calls.create += 1
      const session: Record<string, unknown> = {
        promptStreaming: () => {
          calls.prompt += 1
          return streamFactory()
        },
        clone: async () => session,
        destroy: () => {},
      }
      return session
    },
  })
  return calls
}

// 商品頁：設定 product 路徑 + 注入 Product JSON-LD，讓 worth 模式抓得到事實
function seedProductPage() {
  window.history.replaceState({}, '', '/zh-tw/product/138477')
  const script = document.createElement('script')
  script.type = 'application/ld+json'
  script.textContent = JSON.stringify({
    '@type': 'Product',
    name: '釜山通行證 VISIT BUSAN PASS',
    aggregateRating: { ratingValue: 4.83, reviewCount: 7228, bestRating: 5 },
    offers: { '@type': 'AggregateOffer', lowPrice: 936, priceCurrency: 'TWD', offers: [] },
  })
  document.head.appendChild(script)
}

// 這些測試聚焦「功能 buddy」的行為，不測 consent gate。預設把 gate 同步快取設成 available，
// 讓 Buddy 一掛載就放行、直接進功能（gate 本身另有專屬測試 modelGate.test / ConsentBuddy）。
beforeEach(() => {
  setGateAvailabilityForTest('available')
})

afterEach(async () => {
  cleanup()
  resetGateForTest()
  // 預熱的 session 是模組級的，測試間要收掉，否則下一個測試會沿用上一個 stub 建的實例
  releaseSummarizer()
  releaseWorthIt()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  document.head.querySelectorAll('script[type="application/ld+json"]').forEach((s) => s.remove())
  window.history.replaceState({}, '', '/') // 路徑會影響 isProductPage，測試間重設
  await clearSummaryCache() // 快取以記憶體 fallback 保存，測試間需清掉
  await clearWorthItCache()
  resetSettingsCache() // 設定也以記憶體 fallback 保存，測試間需清掉
})

describe('Buddy 狀態機', () => {
  it('按下「幫我摘要這頁」後進入思考狀態，顯示碎念台詞', async () => {
    seedArticle()
    stubSummarizer(pendingStream)
    render(<Buddy />)

    await startSummary()

    await waitFor(() => expect(screen.getByText('讓我看看這頁在講什麼')).toBeTruthy())
  })

  it('思考時再點頭像會回不耐煩的話，且輪播', async () => {
    seedArticle()
    stubSummarizer(pendingStream)
    render(<Buddy />)

    await startSummary()
    await waitFor(() => expect(screen.getByText('讓我看看這頁在講什麼')).toBeTruthy())

    // 催第一次
    fireEvent.click(avatar())
    const first = await screen.findByText('欸，我還在看啦，別催')
    expect(first.className).toContain('impatient')

    // 催第二次 → 換下一句
    fireEvent.click(avatar())
    expect(await screen.findByText('好啦好啦，馬上就好')).toBeTruthy()
  })

  it('串流完成後從 thinking → speaking → done，渲染摘要與反應列', async () => {
    seedArticle()
    stubSummarizer(chunkStream(['**重點**：', '台灣自由行攻略']))
    render(<Buddy />)

    await startSummary()

    // done 才會出現反應 emoji（用其中一顆的 aria-label 判斷）
    const thumb = await screen.findByRole('button', { name: '讚' })
    expect(thumb).toBeTruthy()
    // markdown 已渲染
    expect(screen.getByText(/台灣自由行攻略/)).toBeTruthy()
  })
})

describe('Buddy emoji 反應', () => {
  async function renderToDone() {
    seedArticle()
    stubSummarizer(chunkStream(['摘要內容']))
    render(<Buddy />)
    await startSummary()
    await screen.findByRole('button', { name: '讚' })
  }

  it('按 emoji 顯示對應回嘴，再按同一顆會換句話', async () => {
    await renderToDone()

    fireEvent.click(screen.getByRole('button', { name: '讚' }))
    expect(await screen.findByText('「嘿嘿，不錯吧」')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '讚' }))
    expect(await screen.findByText('「我就知道你會喜歡」')).toBeTruthy()
  })

  it('不同 emoji 各自從第一句開始', async () => {
    await renderToDone()

    fireEvent.click(screen.getByRole('button', { name: '爛' }))
    expect(await screen.findByText('「蛤？我可是很認真讀的欸」')).toBeTruthy()
  })
})

describe('Buddy 整頁摘要的 Summarizer availability', () => {
  // 可控 availability 的 Summarizer stub（模型就緒把關由 consent gate 負責，但 Summarizer 帶
  // outputLanguage 可能需語言 adapter，故 useSummarizer 仍自己擋 unavailable）
  function stubSummarizerWith(availability: string, streamFactory: () => AsyncIterable<string>) {
    const calls = { create: 0, summarize: 0 }
    vi.stubGlobal('Summarizer', {
      availability: async () => availability,
      create: async () => {
        calls.create += 1
        return {
          summarizeStreaming: () => {
            calls.summarize += 1
            return streamFactory()
          },
          destroy: () => {},
        }
      },
    })
    return calls
  }

  it('Summarizer unavailable（裝置不支援）→ 報錯，不摘要', async () => {
    seedArticle()
    const calls = stubSummarizerWith('unavailable', chunkStream(['內容']))
    render(<Buddy />)

    await startSummary()
    await waitFor(() => expect(screen.getByText(/無法使用內建 AI 模型/)).toBeTruthy())
    expect(calls.summarize).toBe(0)
  })

  it('downloadable（語言 adapter 待補）→ 不擋，直接產生（gate 已同意過下載）', async () => {
    seedArticle()
    const calls = stubSummarizerWith('downloadable', chunkStream(['台灣自由行攻略']))
    render(<Buddy />)

    await startSummary()
    await waitFor(() => expect(screen.getByText(/台灣自由行攻略/)).toBeTruthy())
    expect(calls.summarize).toBe(1)
  })
})

describe('Buddy 快取', () => {
  it('半小時內重開同一頁直接顯示快取，不再呼叫模型、也不用按按鈕', async () => {
    seedArticle()
    const calls = stubSummarizer(chunkStream(['台灣自由行攻略']))
    render(<Buddy />)

    // 第一次：跑模型
    await startSummary()
    await screen.findByRole('button', { name: '讚' })
    expect(calls.summarize).toBe(1)
    expect(screen.queryByText('快取')).toBeNull()

    // 收合再重開：prepare 命中快取 → 直接顯示結果與「快取」標記，不用再按 CTA
    fireEvent.click(avatar()) // close
    fireEvent.click(avatar()) // reopen
    await screen.findByText('快取')
    expect(calls.summarize).toBe(1)
    expect(screen.getByText(/台灣自由行攻略/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '幫我摘要這頁' })).toBeNull()
    // 有快取就不該再載模型：仍是第一次那一份 create（收合時已 release，若這裡預熱會變 2）
    expect(calls.create).toBe(1)
  })

  it('按重做會略過快取、強制重跑', async () => {
    seedArticle()
    const calls = stubSummarizer(chunkStream(['重新摘要的內容']))
    render(<Buddy />)

    await startSummary()
    await screen.findByRole('button', { name: '讚' })
    expect(calls.summarize).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: '重做' }))
    await waitFor(() => expect(calls.summarize).toBe(2))
  })
})

describe('Buddy 商品頁「值不值得買」', () => {
  it('商品頁按下 CTA → 用 Prompt API 給出值不值得買判斷，標題切換', async () => {
    seedProductPage()
    stubLanguageModel(chunkStream(['值得下手，', '評分 4.83 又有免費取消']))
    render(<Buddy />)

    await startWorth()

    // 串流內容出現、標題為「值不值得買」（不是「頁面摘要」）
    await screen.findByText(/評分 4.83 又有免費取消/)
    expect(screen.getByText('值不值得買')).toBeTruthy()
    expect(screen.queryByText('頁面摘要')).toBeNull()
    // done 後出現反應列
    await screen.findByRole('button', { name: '讚' })
  })

  it('商品頁不呼叫整頁摘要的 Summarizer', async () => {
    seedProductPage()
    const lm = stubLanguageModel(chunkStream(['可以考慮']))
    const summ = stubSummarizer(chunkStream(['不該出現的整頁摘要']))
    render(<Buddy />)

    await startWorth()
    await screen.findByText(/可以考慮/)

    expect(lm.prompt).toBe(1)
    expect(summ.create).toBe(0) // 商品頁走 worth，不走整頁摘要
  })
})

describe('Buddy 兩段式觸發（打開只展開、按鈕才跑）', () => {
  it('進頁靜待使用者，不會自己跑摘要', async () => {
    seedArticle()
    const calls = stubSummarizer(chunkStream(['不該出現']))

    render(<Buddy />)
    await new Promise((r) => setTimeout(r, 50))

    expect(calls.create).toBe(0)
    expect(screen.queryByText(/不該出現/)).toBeNull()
  })

  it('點頭像只展開泡泡與邀請按鈕，不推論', async () => {
    seedArticle()
    const calls = stubSummarizer(chunkStream(['不該出現']))
    render(<Buddy />)

    fireEvent.click(avatar())

    expect(await screen.findByRole('button', { name: '幫我摘要這頁' })).toBeTruthy()
    expect(calls.summarize).toBe(0)
    expect(screen.queryByText(/不該出現/)).toBeNull()
  })

  it('點頭像時預先載入模型；按下 CTA 沿用預熱好的實例，不重建', async () => {
    seedArticle()
    const calls = stubSummarizer(chunkStream(['台灣自由行攻略']))
    render(<Buddy />)

    fireEvent.click(avatar())

    await waitFor(() => expect(calls.create).toBe(1)) // 預熱
    expect(calls.summarize).toBe(0)

    fireEvent.click(summaryCta())
    await screen.findByRole('button', { name: '讚' })
    expect(calls.summarize).toBe(1)
    expect(calls.create).toBe(1) // 沿用預熱好的實例（prepare 與 take 的 slot key 一致）
  })

  it('商品頁點頭像只展開，按下 CTA 才判斷；預熱不推論', async () => {
    seedProductPage()
    const calls = stubLanguageModel(chunkStream(['可以考慮']))
    render(<Buddy />)

    fireEvent.click(productAvatar())

    expect(await screen.findByRole('button', { name: '幫我看值不值得' })).toBeTruthy()
    await waitFor(() => expect(calls.create).toBe(1)) // 預熱 baseline session
    expect(calls.prompt).toBe(0)

    fireEvent.click(worthCta())
    await screen.findByText(/可以考慮/)
    expect(calls.prompt).toBe(1)
    expect(calls.create).toBe(1) // 沿用預熱好的 baseline，沒有重建
  })

  it('展開後再點頭像＝收合，回到只有頭像的狀態', async () => {
    seedArticle()
    stubSummarizer(chunkStream(['不該出現']))
    render(<Buddy />)

    fireEvent.click(avatar())
    expect(await screen.findByRole('button', { name: '幫我摘要這頁' })).toBeTruthy()

    fireEvent.click(avatar())
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '幫我摘要這頁' })).toBeNull(),
    )
    expect(screen.queryByText('頁面摘要')).toBeNull()
  })
})

// 「第一次進來」的完整 consent 流程：從 <Buddy /> 頂層驗證 gate 攔截 → 同意 → 下載 → 交棒。
// 難點是模型下過就永久 available，這裡用 stub 把「模型未下載」的狀態穩定重現。
describe('Buddy 第一次進來（模型未下載）的 consent 流程', () => {
  // LanguageModel 為 downloadable（模擬第一次）；create 帶 monitor 時立即回報下載完成，
  // 之後 availability 轉為 available（下載完成後 refresh 讀得到）。
  function stubFirstVisit() {
    let availability = 'downloadable'
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
        availability = 'available' // 下載完成 → 之後校正讀到 available
        return { destroy: () => (calls.destroy += 1) }
      },
    })
    return calls
  }

  it('進頁模型未下載 → 顯示同意提示，不直接進功能 buddy', async () => {
    seedArticle()
    resetGateForTest() // 覆蓋 beforeEach 的 available：回到「還沒校正」的冷啟動
    stubFirstVisit()

    render(<Buddy />)

    // 冷啟動 async 校正到 downloadable → 顯示同意畫面（不是頁面摘要提示）
    await waitFor(() => expect(screen.getByText(/要現在下載並啟用嗎/)).toBeTruthy())
    expect(screen.getByRole('button', { name: '下載並啟用' })).toBeTruthy()
  })

  it('點「下載並啟用」→ 觸發下載，完成後顯示已就緒', async () => {
    seedArticle()
    resetGateForTest()
    const calls = stubFirstVisit()

    render(<Buddy />)
    await screen.findByRole('button', { name: '下載並啟用' })

    fireEvent.click(screen.getByRole('button', { name: '下載並啟用' }))

    await waitFor(() => expect(screen.getByText(/下載完成，已就緒/)).toBeTruthy())
    expect(calls.create).toBe(1) // 有觸發下載
    expect(calls.destroy).toBe(1) // 下載用的 session 有收掉
  })

  it('裝置不支援（LanguageModel 不存在）→ 不自動展開擋畫面，點頭像才看到錯誤', async () => {
    seedArticle()
    resetGateForTest()
    vi.stubGlobal('LanguageModel', undefined)

    render(<Buddy />)

    // 校正完仍只露頭像：錯誤沒有行動可做，不該一進頁面就蓋住內容
    await waitFor(() => expect(screen.getByRole('button', { name: 'Buddy AI' })).toBeTruthy())
    expect(screen.queryByText(/無法使用內建 AI 模型/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Buddy AI' }))
    expect(screen.getByText(/無法使用內建 AI 模型/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '下載並啟用' })).toBeNull()
  })
})
