// 商品說明摘要：用 Prompt API（LanguageModel）串流輸出「一段話」。
// 型別由 @types/dom-chromium-ai 提供（tsconfig types 已引入）。

import type { ToneId } from './settings'

// 商品摘要專屬的語氣描述：針對「一段話」情境調整（不同於 buddy 那組「整理重點」的措辭）。
// key 沿用 popup 的 ToneId，讓使用者的語氣設定直接對應到這裡。
const PRODUCT_TONES: Record<ToneId, string> = {
  humorous: '用輕鬆幽默、偶爾俏皮吐槽的口吻寫，讀起來會心一笑，但別浮誇失焦。',
  serious: '用專業、客觀中立的口吻寫，平實可信、不誇飾。',
  gentle: '用溫柔親切、像朋友真心推薦的口吻寫，讓人感到窩心。',
  passionate: '用熱血、充滿感染力的口吻寫，讓人讀完想立刻出發。',
  cynical: '用厭世、淡定、有點無所謂又帶點自嘲的口吻寫，但資訊仍要講清楚。',
  literary: '用感性、文藝、帶點畫面感的口吻寫，字句細膩但不空泛。',
}


// 給模型的指示：濃縮成「一段話」，聚焦「這是什麼 + 適合哪種旅客」，不要條列 / Markdown。
function buildInstruction(tone: ToneId): string {
  return (
    '請用繁體中文（台灣），把以下 KKday 商品說明濃縮成「一段話」（約 2～3 句，不要分段、' +
    '不要條列、不要標題或 Markdown 符號如 # 或 *）。內容聚焦兩件事：這是什麼樣的商品，' +
    '以及最適合哪一種旅客（用「如果你是……，這很適合你」這種口吻收尾）。只根據內文、不要杜撰。' +
    `\n語氣：${PRODUCT_TONES[tone] ?? PRODUCT_TONES.humorous}\n\n商品說明：\n`
  )
}

// 串流產生摘要：把累積到目前的文字透過 onChunk 往 UI 送，最後回傳完整內容。
// tone 來自 popup 的語氣設定，對應到 PRODUCT_TONES 影響輸出口吻。
export async function generateProductSummary(
  text: string,
  tone: ToneId,
  onChunk?: (accumulated: string) => void,
): Promise<string> {
  if (typeof LanguageModel === 'undefined') {
    throw new Error('這個瀏覽器不支援內建 Prompt API（需要 Chrome 138+，且裝置符合硬體需求）。')
  }

  const session = await LanguageModel.create()
  try {
    let acc = ''
    // promptStreaming 逐塊吐出「新增」的片段（delta），自行累加
    for await (const chunk of session.promptStreaming(buildInstruction(tone) + text)) {
      acc += chunk
      onChunk?.(acc)
    }
    return acc
  } finally {
    session.destroy()
  }
}
