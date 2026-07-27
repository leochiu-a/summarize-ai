// 評論潤飾：把使用者「已經寫好」的評論潤飾得更清楚、更好讀。
// 設計原則：使用者才是原作者，這是他真實的體驗。模型只做「潤飾表達」——
//          修順句子、補上標點、讓語氣一致，但絕不杜撰沒寫到的細節、不改變原意、不誇大，
//          因為評論會公開給其他旅客參考，真實性優先。
//
// 用哪個 API：首選 Rewriter API（語意最貼合「潤飾」），但 Rewriter 至今沒進 Chrome 穩定版——
//          它的 origin trial 只跑到 Chrome 148 就結束，之後只剩 chrome://flags/#rewriter-api
//          可開，所以一般使用者的瀏覽器上 `Rewriter` 直接是 undefined。因此退回 Prompt API
//          （`LanguageModel`，extension 從 Chrome 138 起穩定）用指示達成同一件事。
//          兩條路共用同一份 sharedContext、底層也是同一顆 Gemini Nano，所以 gate 行為一致：
//          modelGate 放行（base model 就緒）就至少有一條路能跑。

import type { ToneId } from './settings'

// 潤飾語氣：對應 popup 的 ToneId（沿用使用者設定）。Rewriter 內建 tone 只有三檔，
// 細緻語氣改用 sharedContext 帶給模型。
const REVIEW_TONES: Record<ToneId, string> = {
  humorous: '輕鬆幽默、帶點俏皮，讀起來會心一笑。',
  serious: '平實、清楚、客觀可信。',
  gentle: '溫柔親切、像跟朋友分享。',
  passionate: '熱情有感染力，讓人也想去體驗。',
  cynical: '淡定直白、有點無所謂但誠實。',
  literary: '感性、帶點畫面感，字句細膩。',
}

// 潤飾的共用指示：守住「只潤飾、不杜撰」的底線。
function sharedContext(tone: ToneId): string {
  return (
    '你是幫使用者潤飾 KKday 旅遊評論的小幫手。使用者已經寫好一段評論，請用繁體中文（台灣）' +
    '把它潤飾得更通順、更好讀，讓其他旅客更容易看懂。務必遵守：' +
    '只根據使用者原文潤飾，不要新增任何他沒提到的細節、地點、數字或感受；' +
    '不要改變原意、不要誇大、不要杜撰；保留他真實的評價與情緒。' +
    '輸出純文字（不要 Markdown 符號、不要標題或條列），長度與原文相近即可。' +
    `\n語氣：${REVIEW_TONES[tone] ?? REVIEW_TONES.gentle}`
  )
}


// 使用者按「重新潤飾」時追加的要求。本機模型即使重跑也常吐出幾乎一樣的句子，
// 得明確要求換句構、換詞，不然使用者會覺得按鈕沒反應。
const REPHRASE_HINT =
  '這是使用者對上一版不滿意後要求的重寫：請換不同的句構與用詞重新潤飾一次，' +
  '不要重複上一版的寫法。但一樣不能杜撰或改變原意。'

export interface RewriteOptions {
  // true = 使用者主動要「換一版」，會要求模型換個說法
  rephrase?: boolean
}

// Prompt API 版要多講的話：Rewriter 靠 API 語意就知道「輸入是待潤飾的原文」，
// 通用 LanguageModel 不知道，得明確要求它只吐潤飾後的本文，不要加開場白或解釋。
function buildPrompt(draft: string, tone: ToneId, rephrase?: boolean): string {
  return (
    `${sharedContext(tone)}\n` +
    '只輸出潤飾後的評論本文：不要加開場白、說明、標題或引號，也不要解釋你改了什麼。\n' +
    (rephrase ? `${REPHRASE_HINT}\n` : '') +
    `\n使用者原文：\n${draft}`
  )
}

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

// 走 Rewriter：這條路不能走就回 null，交給呼叫端 fallback。
// 注意「不能走」只包含 availability / create 階段的失敗——一旦開始串流，UI 上已經有文字了，
// 這時再退回 Prompt API 重跑會讓畫面整段跳掉，所以讓錯誤直接浮上去。
async function tryRewriter(
  draft: string,
  tone: ToneId,
  onChunk?: (accumulated: string) => void,
  options?: RewriteOptions,
): Promise<string | null> {
  if (typeof Rewriter === 'undefined') return null

  let rewriter: Rewriter
  try {
    if ((await Rewriter.availability()) === 'unavailable') return null
    rewriter = await Rewriter.create({
      tone: 'as-is', // 細緻語氣走 sharedContext，這裡不強制更正式/更口語
      format: 'plain-text',
      length: 'as-is',
      sharedContext: sharedContext(tone),
    })
  } catch {
    return null
  }

  try {
    // 重寫要求走 per-call context（sharedContext 是 session 級的，這裡才是這一次的補充）
    const context = options?.rephrase ? REPHRASE_HINT : undefined
    return await drain(rewriter.rewriteStreaming(draft, { context }), onChunk)
  } finally {
    rewriter.destroy()
  }
}

// 走 Prompt API（fallback）：create 不帶選項，跟 modelGate 的 base-model probe 走同一條 path。
async function rewriteWithPrompt(
  draft: string,
  tone: ToneId,
  onChunk?: (accumulated: string) => void,
  options?: RewriteOptions,
): Promise<string> {
  const session = await LanguageModel.create()
  try {
    const prompt = buildPrompt(draft, tone, options?.rephrase)
    return await drain(session.promptStreaming(prompt), onChunk)
  } finally {
    session.destroy()
  }
}

// 串流潤飾：把累積到目前的文字透過 onChunk 往 UI 送，最後回傳完整內容。
// draft 是使用者輸入框裡現有的評論文字。Rewriter 優先，不可用時退回 Prompt API。
export async function generateRewrite(
  draft: string,
  tone: ToneId,
  onChunk?: (accumulated: string) => void,
  options?: RewriteOptions,
): Promise<string> {
  const viaRewriter = await tryRewriter(draft, tone, onChunk, options)
  if (viaRewriter !== null) return viaRewriter

  if (typeof LanguageModel === 'undefined') {
    throw new Error('這個瀏覽器沒有可用的內建 AI 潤飾功能（需要 Chrome 138+，且裝置符合硬體需求）。')
  }
  return rewriteWithPrompt(draft, tone, onChunk, options)
}
