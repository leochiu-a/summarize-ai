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

// 三種結論。用 as const 讓型別與 schema 的 enum 共用同一份真相。
export const WORTH_VERDICTS = ['值得下手', '可以考慮', '再想想'] as const
export type WorthVerdict = (typeof WORTH_VERDICTS)[number]

// 結構化輸出的 schema（傳給 Prompt API 的 responseConstraint）。
// 為什麼要用它：原本「第一句請用『值得下手』開頭」是靠 prompt 指示約束格式，
// 本機小模型很容易破格（多一句開場白、改用別的措辭、吐 Markdown）。改成 schema 之後
// verdict 是 enum，模型在解碼層就出不了格，UI 也才有可靠的結論可以拿來做視覺區分。
// 註：刻意不用 maxLength 限制 reason 長度——官方明列這是反模式（模型會改用高密度
// token 或 emoji 硬湊字數），長度仍然用指示說。
export const WORTH_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: [...WORTH_VERDICTS] },
    reason: { type: 'string' },
  },
  required: ['verdict', 'reason'],
  additionalProperties: false,
} as const

export interface WorthItResult {
  verdict: WorthVerdict | null // 沒能結構化解析出來時為 null（見 parseWorthIt）
  reason: string
  text: string // 給 UI 顯示與快取用的組合結果
}

// 給模型的指示：只依提供的事實、不得杜撰。格式由 WORTH_SCHEMA 強制，
// 但這裡仍保留精簡的格式說明當退路——萬一某些裝置忽略 responseConstraint，
// 輸出至少還是「結論先行 + 短理由」的可讀文字，不會比改版前更糟。
export function buildInstruction(tone: ToneId, facts: ProductFacts): string {
  return (
    '你是幫使用者判斷「這個 KKday 商品值不值得下手」的購物小幫手。' +
    '請用繁體中文（台灣），根據下面提供的商品事實，以結論先行的方式回答，輸出兩個欄位：\n' +
    `1) verdict：從「${WORTH_VERDICTS.join('」「')}」三者中選一個，不要自創其他措辭；\n` +
    '2) reason：用 1～3 句說明理由，可綜合評分、評論數、價格、折扣券、取消政策等。' +
    '若有划算的折扣券或促銷，點出來提醒使用者別忘了用（但不要自己計算折後金額，' +
    '也不要杜撰沒提供的數字或條件）。純文字，不要 Markdown 符號（# 或 *）、不要條列。\n' +
    '只根據下列事實作答，沒有的資訊就不要提。\n' +
    `語氣：${WORTH_TONES[tone] ?? WORTH_TONES.humorous}\n\n` +
    `商品事實：\n${factsToText(facts)}`
  )
}

// 從 JSON 文字裡取出某個字串欄位的值。容許「還沒收完」的片段（串流中一定 parse 不過），
// 所以不用 JSON.parse：找到 "key":" 之後一路讀到未被轉義的收尾引號，沒收到就讀到結尾。
function readJsonString(buf: string, key: string): string | null {
  const at = buf.indexOf(`"${key}"`)
  if (at === -1) return null
  const colon = buf.indexOf(':', at + key.length + 2)
  if (colon === -1) return null
  const open = buf.indexOf('"', colon + 1)
  if (open === -1) return null

  let out = ''
  for (let i = open + 1; i < buf.length; i++) {
    const ch = buf[i]
    if (ch === '\\') {
      const next = buf[i + 1]
      if (next === undefined) break // 轉義序列被切在 chunk 邊界，下一塊再處理
      out += next === 'n' ? '\n' : next === 't' ? '\t' : next
      i++
      continue
    }
    if (ch === '"') break // 字串結束
    out += ch
  }
  return out
}

// 把 verdict / reason 組成給人看的一段話。
function composeText(verdict: string | null, reason: string): string {
  if (verdict && reason) return `${verdict}，${reason.replace(/^[，,。\s]+/, '')}`
  return verdict ?? reason
}

/**
 * 解析模型輸出。同一個函式要同時應付三種輸入，所以順序有意義：
 *
 * 1. 不以 `{` 開頭 → 裝置忽略了 responseConstraint、直接吐散文。整段當理由用，
 *    這樣降級時仍然有東西可顯示（也仍然能串流）。
 * 2. 完整 JSON → 嚴格 JSON.parse。
 * 3. 片段 JSON（串流途中必然如此）→ 容錯抽取已到齊的欄位。抽不到就回空字串，
 *    **絕不**把半截的 `{"verd` 丟給使用者看。
 */
export function parseWorthIt(raw: string): WorthItResult {
  const trimmed = raw.trim()
  const empty: WorthItResult = { verdict: null, reason: '', text: '' }
  if (!trimmed) return empty

  const isVerdict = (v: unknown): v is WorthVerdict =>
    typeof v === 'string' && (WORTH_VERDICTS as readonly string[]).includes(v)

  // ① 散文（沒套用 schema）
  if (!trimmed.startsWith('{')) return { verdict: null, reason: trimmed, text: trimmed }

  // ② 完整 JSON
  try {
    const obj = JSON.parse(trimmed) as { verdict?: unknown; reason?: unknown }
    const verdict = isVerdict(obj.verdict) ? obj.verdict : null
    const reason = typeof obj.reason === 'string' ? obj.reason.trim() : ''
    return { verdict, reason, text: composeText(verdict, reason) }
  } catch {
    // 往下走 ③
  }

  // ③ 片段 JSON
  const loose = readJsonString(trimmed, 'verdict')
  const verdict = isVerdict(loose) ? loose : null
  const reason = (readJsonString(trimmed, 'reason') ?? '').trim()
  if (!verdict && !reason) return empty
  return { verdict, reason, text: composeText(verdict, reason) }
}

// 串流產生判斷。onChunk 收到的是「已經整理成人話」的累積文字，不是原始 JSON——
// 串流中的 JSON 一定是破的，直接顯示會讓使用者看到一堆引號和大括號，所以每收到一塊就
// 容錯抽取一次再送出去。回傳結構化結果（UI 用 .text，verdict 可用於視覺區分）。
export async function generateWorthIt(
  facts: ProductFacts,
  tone: ToneId,
  onChunk?: (accumulated: string) => void,
): Promise<WorthItResult> {
  if (typeof LanguageModel === 'undefined') {
    throw new Error('這個瀏覽器不支援內建 Prompt API（需要 Chrome 138+，且裝置符合硬體需求）。')
  }

  const session = await LanguageModel.create()
  try {
    let raw = ''
    const stream = session.promptStreaming(buildInstruction(tone, facts), {
      responseConstraint: WORTH_SCHEMA,
    })
    for await (const chunk of stream) {
      raw += chunk
      if (onChunk) {
        const partial = parseWorthIt(raw)
        // 還沒抽到任何內容前不要送空字串（會讓泡泡閃一下空白）
        if (partial.text) onChunk(partial.text)
      }
    }
    return parseWorthIt(raw)
  } finally {
    session.destroy()
  }
}
