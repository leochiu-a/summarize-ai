// 頁面擷取與純邏輯工具
// Summarizer API 的型別由 @types/dom-chromium-ai 提供（tsconfig types 已引入）

import { Readability } from '@mozilla/readability'
import { createWarmSlot } from './warmSession'

// Summarizer 有輸入額度限制，過長的內文截斷處理
const MAX_CHARS = 16000
// 少於這個字數視為沒有值得摘要的內文
const MIN_CHARS = 200
// Readability 判定主內文的最低字數門檻。預設 500 對中文（資訊密度高、字數少）太嚴，調低。
const CHAR_THRESHOLD = 250

export interface Content {
  title: string
  text: string
}

// 擷取要摘要的內容。策略：
// 1. 先用 Readability（Firefox 閱讀模式核心）抽乾淨的正文 —— 文章頁效果最好，
//    輸入短、模型也快。
// 2. 抽不出正文（首頁、列表頁、應用程式介面等）就退回擷取整頁可見文字，
//    這樣非文章頁一樣能總結。
// 只有整頁幾乎沒有文字時才回傳 null。
export function extractContent(): Content | null {
  const article = tryReadability()
  if (article) return article

  const text = extractVisibleText()
  if (text.length < MIN_CHARS) return null
  return { title: document.title, text: text.slice(0, MAX_CHARS) }
}

function tryReadability(): Content | null {
  // Readability 會改動傳入的 document，複製一份再解析
  const clone = document.cloneNode(true) as Document
  const article = new Readability(clone, { charThreshold: CHAR_THRESHOLD }).parse()
  if (!article?.textContent) return null

  const text = article.textContent.replace(/\n{3,}/g, '\n\n').trim()
  if (text.length < MIN_CHARS) return null

  return { title: article.title || document.title, text: text.slice(0, MAX_CHARS) }
}

// 高信心的「一定不是內文」選擇器：
// - 程式/資源節點：script、style、template、application/json 等（框架 hydration 資料藏在這）
// - 結構性外框：nav / header / footer / aside 與對應的 ARIA role
// - 互動與彈窗：cookie 同意框、對話框、搜尋框
// - 隱藏元素：aria-hidden / hidden / inline display:none
//   （分離節點上 innerText 算不出版面，不會自動濾掉隱藏文字，得手動移除）
// 只用標籤與 role，不猜 class 名稱，避免誤殺真正的內容（例如「菜單 menu」頁）。
const NOISE_SELECTOR = [
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'template',
  '[type="application/json"]',
  'nav',
  'header',
  'footer',
  'aside',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="search"]',
  '[role="dialog"]',
  '[aria-hidden="true"]',
  '[hidden]',
  '[style*="display:none"]',
  '[style*="display: none"]',
].join(',')

// 擷取整頁可見文字，濾掉框架資料與導覽/彈窗等一定不是內文的東西
// （匯出供測試：這是非文章頁的過濾邏輯本體）
export function extractVisibleText(): string {
  const clone = document.body.cloneNode(true) as HTMLElement
  clone.querySelectorAll(NOISE_SELECTOR).forEach((el) => el.remove())
  // 分離節點上 innerText 偶爾為空，退回 textContent 保底
  const raw = clone.innerText || clone.textContent || ''
  return (
    raw
      // 壓掉大量重複空白與空行（卡片式版面常見）
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function pickOutputLanguage(): string {
  const pageLang = (document.documentElement.lang || navigator.language || 'en').toLowerCase()
  return pageLang.startsWith('zh') ? 'zh-Hant' : pageLang.split('-')[0]
}

/**====================== Summarizer 實例（預熱 / 取用） ======================*/
// 使用者展開泡泡時就先把 Summarizer 建起來（預熱），按下按鈕才真的 summarizeStreaming。
// Summarizer 實例本身無狀態（沒有 clone、也不累積歷史），同一組選項可以重複使用，
// 所以這裡直接沿用同一個實例，只在收合泡泡時 release。
// 選項變了（使用者改語氣 / 摘要類型）→ key 不同 → warm slot 自動收掉舊的重建。

// 這裡用得到的 create 選項（signal / monitor 不用，也不能序列化成 key）
export type SummarizerOptions = Omit<SummarizerCreateOptions, 'signal' | 'monitor'>

const summarizerSlot = createWarmSlot<Summarizer>((key) =>
  createSummarizer(JSON.parse(key) as SummarizerOptions),
)

// 建立 Summarizer。部分語言不在支援清單，帶 outputLanguage 失敗時退回預設輸出語言。
async function createSummarizer(options: SummarizerOptions): Promise<Summarizer> {
  try {
    return await Summarizer.create({ ...options, outputLanguage: pickOutputLanguage() })
  } catch {
    return await Summarizer.create(options)
  }
}

// key 就是 create 選項本身（序列化）：選項一樣才算同一份預熱
const slotKey = (options: SummarizerOptions) => JSON.stringify(options)

/** 預熱：先把這組選項的 Summarizer 建起來放著（失敗由呼叫端吞掉，預熱是機會財）。 */
export function warmSummarizer(options: SummarizerOptions): Promise<Summarizer> {
  return summarizerSlot.warm(slotKey(options))
}

/** 取用：命中預熱＝零等待；沒預熱過（或選項變了）就現場建。 */
export function takeSummarizer(options: SummarizerOptions): Promise<Summarizer> {
  return summarizerSlot.take(slotKey(options))
}

/** 收掉預熱／使用中的 Summarizer（泡泡收合時呼叫，別把 session 留在記憶體）。 */
export function releaseSummarizer(): void {
  summarizerSlot.release()
}
