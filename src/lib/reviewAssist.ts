// 評論頁「AI 幫你寫」的模型層：一支模組服務輸入框下方那四顆按鈕。
//
// 四個動作（AssistAction）：
// - polish：把已寫好的心得潤順、好讀
// - opening：還沒下筆時，用他自己填過的表單資訊起個頭
// - expand：太短時把已經寫的展開講完整
// - retone：換一種語氣重寫
//
// 共同的底線：使用者才是原作者，這是他真實的體驗。模型只做「表達」——修順句子、換個說法、
// 把講到一半的話講完，但**絕不杜撰他沒寫過的細節**，因為評論會公開給其他旅客參考。
// opening 是唯一會「無中生有」的動作，所以它的素材被限制在他自己在這張表單上填過的東西
// （商品、星等、旅伴類別、標題），並且刻意留白讓他自己補體驗。
//
// 用哪個 API：polish 首選 Rewriter API（語意最貼合「潤飾」），但 Rewriter 至今沒進 Chrome
// 穩定版——origin trial 只跑到 Chrome 148，之後只剩 chrome://flags/#rewriter-api 可開，
// 所以一般使用者的瀏覽器上 `Rewriter` 直接是 undefined。其餘三個動作沒有對應的 API 語意，
// 一律走 Prompt API（`LanguageModel`，extension 從 Chrome 138 起穩定）。兩條路底層都是同一顆
// Gemini Nano，gate 行為一致：modelGate 放行（base model 就緒）就至少有一條路能跑。

import type { ReviewContext } from './reviewPage'
import type { ToneId } from './settings'
import { createWarmSlot } from './warmSession'

export type AssistAction = 'polish' | 'opening' | 'expand' | 'retone'

// 潤飾語氣：對應 popup 的 ToneId。Rewriter 內建 tone 只有三檔，細緻語氣一律用文字描述帶給模型。
const REVIEW_TONES: Record<ToneId, string> = {
  humorous: '輕鬆幽默、帶點俏皮，讀起來會心一笑。',
  serious: '平實、清楚、客觀可信。',
  gentle: '溫柔親切、像跟朋友分享。',
  passionate: '熱情有感染力，讓人也想去體驗。',
  cynical: '淡定直白、有點無所謂但誠實。',
  literary: '感性、帶點畫面感，字句細膩。',
}

// 不隨動作、不隨語氣改變的規矩，放在 create() 的 system message 一次講完
// （Chrome 官方建議〈Set initial prompts during creation〉：規則先處理完，第一個 prompt 更快）。
// 語氣**不放**在這裡——「換個語氣」的語氣是每次點擊才決定的，放進 baseline 會讓它換不動。
export const SYSTEM_INSTRUCTION =
  '你是幫使用者寫 KKday 旅遊評論的小幫手。一律用繁體中文（台灣）輸出純文字：' +
  '不要 Markdown 符號、不要標題或條列、不要引號、不要開場白，也不要解釋你做了什麼，' +
  '只輸出評論本文。真實性優先：這是使用者自己的旅程，' +
  '不要新增他沒提到的細節、地點、數字或感受，不要改變原意、不要誇大。'

export interface AssistInput {
  action: AssistAction
  draft: string // 輸入框現有文字（opening 時為空）
  context: ReviewContext // 表單上已填好的資訊（opening / expand 用得到）
  tone: ToneId // 這次要用的語氣（retone 帶使用者選的，其餘沿用 popup 設定）
  limit?: number | null // 字數上限（輸入框的 maxlength）
  rephrase?: boolean // 使用者按「換一個」：要求換句構與用詞
}

// 使用者按「換一個」時追加的要求。本機模型即使重跑也常吐出幾乎一樣的句子，
// 得明確要求換句構、換詞，不然使用者會覺得按鈕沒反應。
const REPHRASE_HINT =
  '這是使用者對上一版不滿意後要求的重寫：請換不同的句構與用詞重新寫一次，' +
  '不要重複上一版的寫法。但一樣不能杜撰或改變原意。'

// opening 的素材：只列使用者自己填過的欄位，沒填的一個字都不提
// （空欄位若也寫進 prompt，模型會自作主張把它補滿）。
function contextLines(context: ReviewContext): string {
  const lines = [
    context.productName && `商品：${context.productName}`,
    context.rating && `他給的評分：${context.rating} 顆星（滿分 5）`,
    context.travellerType && `同行對象：${context.travellerType}`,
    context.title && `他自己下的標題：${context.title}`,
  ].filter(Boolean)
  return lines.length ? lines.join('\n') : '（他還沒填任何資訊）'
}

// 每個動作要對模型交代的事。合起來的 prompt = 動作指示 + 語氣 + 字數上限 + 素材。
function instructionFor(action: AssistAction): string {
  switch (action) {
    case 'polish':
      return '請把下面這段評論潤飾得更通順、更好讀，長度與原文相近。'
    case 'opening':
      return (
        '使用者還沒下筆。請根據他在表單上填好的資訊，寫 2～3 句評論開頭，讓他有東西可以接著改。' +
        '只能寫這些資訊本身確定的事（買了什麼、給幾顆星、跟誰去），' +
        '不要描寫任何你不知道的體驗細節（不要編天氣、排隊、服務、行程內容）。' +
        '最後留一句開放的話，讓他自己補上實際感受。'
      )
    case 'expand':
      return (
        '使用者覺得自己寫得太短，想再多寫一點。請把下面這段擴寫成更完整的評論：' +
        '把他已經提到的點講得更清楚、補上前後鋪陳與收尾的推薦語。' +
        '嚴禁新增他沒提過的事實或細節——只能把他寫過的東西講得更完整。'
      )
    case 'retone':
      return '請用指定的語氣重寫下面這段評論。內容、事實、評價一字不改，只換說法。'
  }
}

export function buildPrompt(input: AssistInput): string {
  const { action, draft, context, tone, limit, rephrase } = input
  const parts = [
    instructionFor(action),
    `語氣：${REVIEW_TONES[tone] ?? REVIEW_TONES.gentle}`,
    limit ? `全文不要超過 ${limit} 字。` : '',
    rephrase ? REPHRASE_HINT : '',
    action === 'opening' ? `他填的資訊：\n${contextLines(context)}` : `使用者原文：\n${draft}`,
  ]
  return parts.filter(Boolean).join('\n')
}

/**====================== session（預熱 / 取用） ======================*/
// 工具列一出現在使用者眼前就先建好 baseline session（預熱），按下按鈕才 clone 出來問。
// key 是常數：system 指示不含語氣，換語氣不需要重建 baseline。
const BASE_KEY = 'review-assist'

const assistSlot = createWarmSlot<LanguageModel>(async () => {
  if (typeof LanguageModel === 'undefined') {
    throw new Error('這個瀏覽器不支援內建 Prompt API（需要 Chrome 138+，且裝置符合硬體需求）。')
  }
  return await LanguageModel.create({
    initialPrompts: [{ role: 'system', content: SYSTEM_INSTRUCTION }],
  })
})

/** 預熱：先把 baseline session 建起來（失敗由呼叫端吞掉，預熱是機會財）。 */
export function prewarmReviewAssist(): Promise<LanguageModel> {
  return assistSlot.warm(BASE_KEY)
}

/** 收掉 baseline session（工具列被拆掉時呼叫）。 */
export function releaseReviewAssist(): void {
  assistSlot.release()
}

/**====================== 產生 ======================*/
// 把串流逐塊累加，同時透過 onChunk 往 UI 送；最後回傳完整內容。
async function drain(
  stream: AsyncIterable<string>,
  onChunk?: (accumulated: string) => void,
): Promise<string> {
  let acc = ''
  for await (const chunk of stream) {
    acc += chunk
    onChunk?.(acc)
  }
  return acc
}

// polish 專用：走 Rewriter。這條路不能走就回 null，交給呼叫端 fallback。
// 注意「不能走」只包含 availability / create 階段的失敗——一旦開始串流，UI 上已經有文字了，
// 這時再退回 Prompt API 重跑會讓畫面整段跳掉，所以讓錯誤直接浮上去。
async function tryRewriter(
  input: AssistInput,
  onChunk?: (accumulated: string) => void,
): Promise<string | null> {
  if (typeof Rewriter === 'undefined') return null

  let rewriter: Rewriter
  try {
    if ((await Rewriter.availability()) === 'unavailable') return null
    rewriter = await Rewriter.create({
      tone: 'as-is', // 細緻語氣走 sharedContext，這裡不強制更正式/更口語
      format: 'plain-text',
      length: 'as-is',
      sharedContext: `${SYSTEM_INSTRUCTION}\n語氣：${REVIEW_TONES[input.tone] ?? REVIEW_TONES.gentle}`,
    })
  } catch {
    return null
  }

  try {
    // 重寫要求走 per-call context（sharedContext 是 session 級的，這裡才是這一次的補充）
    const context = input.rephrase ? REPHRASE_HINT : undefined
    return await drain(rewriter.rewriteStreaming(input.draft, { context }), onChunk)
  } finally {
    rewriter.destroy()
  }
}

// 走 Prompt API：命中預熱＝零等待，每次執行 clone 一份 baseline，用完就 destroy。
async function runWithPrompt(
  input: AssistInput,
  onChunk?: (accumulated: string) => void,
): Promise<string> {
  const base = await assistSlot.take(BASE_KEY)
  const session = await base.clone()
  try {
    return await drain(session.promptStreaming(buildPrompt(input)), onChunk)
  } finally {
    session.destroy() // 只收 clone，baseline 由 releaseReviewAssist 統一收
  }
}

/**
 * 串流產生某個動作的結果：把累積到目前的文字透過 onChunk 往 UI 送，最後回傳完整內容。
 * polish 優先走 Rewriter（語意最貼合），其餘動作與 Rewriter 不可用時走 Prompt API。
 */
export async function generateAssist(
  input: AssistInput,
  onChunk?: (accumulated: string) => void,
): Promise<string> {
  if (input.action === 'polish') {
    const viaRewriter = await tryRewriter(input, onChunk)
    if (viaRewriter !== null) return viaRewriter
  }
  return runWithPrompt(input, onChunk)
}
