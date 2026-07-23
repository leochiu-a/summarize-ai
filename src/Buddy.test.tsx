import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Buddy } from './Buddy'
import { resetSettingsCache, saveSettings } from './lib/settings'
import { clearSummaryCache } from './lib/summaryCache'

// 用一段夠長的文章塞進頁面，讓 extractContent 抽得到內容（需超過長度門檻）
function seedArticle() {
  const p =
    '這是一段夠長的測試內文，用來讓內容擷取器判定這個頁面確實有值得摘要的文字段落，' +
    '需要足夠的字數、標點與句子結構才能通過 Readability 與長度門檻的檢查，' +
    '因此這裡刻意寫得長一點，模擬真實文章裡連貫敘述的樣子。'
  const paras = Array.from({ length: 4 }, () => `<p>${p}</p>`).join('')
  document.body.insertAdjacentHTML('afterbegin', `<article><h1>測試文章</h1>${paras}</article>`)
}

// 建立可控的 Summarizer stub：streamFactory 決定串流吐出什麼，並記錄呼叫次數
function stubSummarizer(streamFactory: () => AsyncIterable<string>) {
  const calls = { create: 0 }
  vi.stubGlobal('Summarizer', {
    availability: async () => 'available',
    create: async () => {
      calls.create += 1
      return {
        summarizeStreaming: () => streamFactory(),
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

const avatar = () => screen.getByRole('button', { name: '點我摘要這個頁面' })

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  await clearSummaryCache() // 快取以記憶體 fallback 保存，測試間需清掉
  resetSettingsCache() // 設定也以記憶體 fallback 保存，測試間需清掉
})

describe('Buddy 狀態機', () => {
  it('點頭像後進入思考狀態，顯示碎念台詞', async () => {
    seedArticle()
    stubSummarizer(pendingStream)
    render(<Buddy />)

    fireEvent.click(avatar())

    await waitFor(() => expect(screen.getByText('讓我看看這頁在講什麼')).toBeTruthy())
  })

  it('思考時再點頭像會回不耐煩的話，且輪播', async () => {
    seedArticle()
    stubSummarizer(pendingStream)
    render(<Buddy />)

    fireEvent.click(avatar())
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

    fireEvent.click(avatar())

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
    fireEvent.click(avatar())
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

describe('Buddy 快取', () => {
  it('半小時內重開同一頁用快取，不再呼叫模型', async () => {
    seedArticle()
    const calls = stubSummarizer(chunkStream(['台灣自由行攻略']))
    render(<Buddy />)

    // 第一次：跑模型
    fireEvent.click(avatar())
    await screen.findByRole('button', { name: '讚' })
    expect(calls.create).toBe(1)
    expect(screen.queryByText('快取')).toBeNull()

    // 收合再重開：命中快取，不再呼叫模型，且顯示「快取」標記
    fireEvent.click(avatar()) // close
    fireEvent.click(avatar()) // reopen
    await screen.findByText('快取')
    expect(calls.create).toBe(1)
    expect(screen.getByText(/台灣自由行攻略/)).toBeTruthy()
  })

  it('按重新摘要會略過快取、強制重跑', async () => {
    seedArticle()
    const calls = stubSummarizer(chunkStream(['重新摘要的內容']))
    render(<Buddy />)

    fireEvent.click(avatar())
    await screen.findByRole('button', { name: '讚' })
    expect(calls.create).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: '重新抓取' }))
    await waitFor(() => expect(calls.create).toBe(2))
  })
})

describe('Buddy 自動摘要設定', () => {
  it('開啟「每頁自動摘要」時，載入即自動觸發', async () => {
    seedArticle()
    await saveSettings({ autoRun: true })
    stubSummarizer(chunkStream(['自動觸發的摘要']))

    render(<Buddy />)

    // 沒有點擊頭像，應該自己跑到 done
    await screen.findByRole('button', { name: '讚' })
    expect(screen.getByText(/自動觸發的摘要/)).toBeTruthy()
  })

  it('關閉「每頁自動摘要」（預設）時，載入不會自動觸發', async () => {
    seedArticle()
    const calls = stubSummarizer(chunkStream(['不該出現']))

    render(<Buddy />)
    await new Promise((r) => setTimeout(r, 50))

    expect(calls.create).toBe(0)
    expect(screen.queryByText(/不該出現/)).toBeNull()
  })
})
