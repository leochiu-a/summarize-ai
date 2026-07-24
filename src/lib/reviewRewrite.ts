// 評論潤飾：用 Rewriter API 把使用者「已經寫好」的評論潤飾得更清楚、更好讀。
// 設計原則：使用者才是原作者，這是他真實的體驗。模型只做「潤飾表達」——
//          修順句子、補上標點、讓語氣一致，但絕不杜撰沒寫到的細節、不改變原意、不誇大，
//          因為評論會公開給其他旅客參考，真實性優先。

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

// 用 Rewriter.availability 判斷模型狀態；不支援 API 時視為 unavailable
export async function availability(): Promise<Availability> {
  if (typeof Rewriter === 'undefined') return 'unavailable'
  return Rewriter.availability()
}

// 串流潤飾：把累積到目前的文字透過 onChunk 往 UI 送，最後回傳完整內容。
// draft 是使用者輸入框裡現有的評論文字。
export async function generateRewrite(
  draft: string,
  tone: ToneId,
  onChunk?: (accumulated: string) => void,
): Promise<string> {
  if (typeof Rewriter === 'undefined') {
    throw new Error('這個瀏覽器不支援內建 Rewriter API（需要 Chrome 138+，且裝置符合硬體需求）。')
  }

  const rewriter = await Rewriter.create({
    tone: 'as-is', // 細緻語氣走 sharedContext，這裡不強制更正式/更口語
    format: 'plain-text',
    length: 'as-is',
    sharedContext: sharedContext(tone),
  })
  try {
    let acc = ''
    for await (const chunk of rewriter.rewriteStreaming(draft)) {
      acc += chunk
      onChunk?.(acc)
    }
    return acc
  } finally {
    rewriter.destroy()
  }
}
