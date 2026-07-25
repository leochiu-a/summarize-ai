// 「值不值得買」判斷：用 Prompt API（LanguageModel）串流輸出「結論先行 + 短理由」。
// 設計原則：數字（評分、價格、折扣券）由 productFacts 以乾淨的值餵進來，
//          模型只負責「綜合判斷 + 講人話」，不做 parse 或算數（本機模型算數不可靠）。

import type { ProductFacts } from './productFacts'
import type { ToneId } from './settings'

// 值不值得專屬語氣：對應 popup 的 ToneId，讓使用者的語氣設定直接套用到這裡。
const WORTH_TONES: Record<ToneId, string> = {
  humorous: '用輕鬆幽默、偶爾俏皮吐槽的口吻，讀起來會心一笑，但判斷仍要中肯。',
  serious: '用專業、客觀中立的口吻，平實可信、不誇飾。',
  gentle: '用溫柔親切、像朋友真心建議的口吻，讓人感到窩心。',
  passionate: '用熱血、充滿感染力的口吻，但別為了推坑而失真。',
  cynical: '用厭世、淡定、有點無所謂又帶點自嘲的口吻，但該講的還是講清楚。',
  literary: '用感性、帶點畫面感的口吻，字句細膩但不空泛。',
}


// 把結構化事實轉成給模型看的條列文字。只列有值的欄位，避免模型看到 undefined 亂掰。
export function factsToText(facts: ProductFacts): string {
  const lines: string[] = []
  if (facts.name) lines.push(`商品名稱：${facts.name}`)
  if (facts.category) lines.push(`分類：${facts.category}`)

  if (facts.rating != null) {
    const base = facts.bestRating ?? 5
    const count = facts.ratingCount != null ? `，共 ${facts.ratingCount} 則評論` : ''
    lines.push(`評分：${facts.rating} / ${base}${count}`)
  }
  if (facts.sales) lines.push(`銷量：${facts.sales}`)

  if (facts.lowPrice != null) {
    const cur = facts.currency ?? ''
    const range =
      facts.highPrice != null && facts.highPrice !== facts.lowPrice
        ? `${cur} ${facts.lowPrice}～${facts.highPrice}`
        : `${cur} ${facts.lowPrice}`
    lines.push(`價格：${range.trim()} 起`)
  }
  if (facts.offers.length) {
    const plans = facts.offers
      .map((o) => `${o.name ?? '方案'}${o.price != null ? ` ${o.price}` : ''}`)
      .join('、')
    lines.push(`方案：${plans}`)
  }

  if (facts.coupons.length) lines.push(`可用折扣券：${facts.coupons.join('、')}`)
  if (facts.promo) lines.push(`促銷：${facts.promo}`)
  if (facts.cancelPolicy) lines.push(`取消政策：${facts.cancelPolicy}`)

  if (facts.description) lines.push(`商品說明：${facts.description.slice(0, 1500)}`)

  return lines.join('\n')
}

// 給模型的指示：結論先行 + 短理由，只依提供的事實、不得杜撰。
export function buildInstruction(tone: ToneId, facts: ProductFacts): string {
  return (
    '你是幫使用者判斷「這個 KKday 商品值不值得下手」的購物小幫手。' +
    '請用繁體中文（台灣），根據下面提供的商品事實，給出「結論先行 + 簡短理由」的建議，' +
    '總長約 2～4 句：\n' +
    '1) 第一句直接給結論，用「值得下手」「可以考慮」「再想想」這類明確措辭開頭；\n' +
    '2) 接著用 1～2 句說明理由，可綜合評分、評論數、價格、折扣券、取消政策等；\n' +
    '3) 若有划算的折扣券或促銷，點出來提醒使用者別忘了用（但不要自己計算折後金額，' +
    '也不要杜撰沒提供的數字或條件）。\n' +
    '只根據下列事實作答，沒有的資訊就不要提；不要用 Markdown 符號（# 或 *）、不要分段或條列。\n' +
    `語氣：${WORTH_TONES[tone] ?? WORTH_TONES.humorous}\n\n` +
    `商品事實：\n${factsToText(facts)}`
  )
}

// 串流產生判斷：逐塊把累積內容透過 onChunk 往 UI 送，最後回傳完整內容。
export async function generateWorthIt(
  facts: ProductFacts,
  tone: ToneId,
  onChunk?: (accumulated: string) => void,
): Promise<string> {
  if (typeof LanguageModel === 'undefined') {
    throw new Error('這個瀏覽器不支援內建 Prompt API（需要 Chrome 138+，且裝置符合硬體需求）。')
  }

  const session = await LanguageModel.create()
  try {
    let acc = ''
    for await (const chunk of session.promptStreaming(buildInstruction(tone, facts))) {
      acc += chunk
      onChunk?.(acc)
    }
    return acc
  } finally {
    session.destroy()
  }
}
