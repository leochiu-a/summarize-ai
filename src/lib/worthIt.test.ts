import { describe, expect, it } from 'vitest'
import type { ProductFacts } from './productFacts'
import { WORTH_SCHEMA, buildInstruction, factsToText, parseWorthIt } from './worthIt'

const FACTS: ProductFacts = {
  name: '釜山通行證 VISIT BUSAN PASS',
  category: '景點通票',
  rating: 4.83,
  ratingCount: 7228,
  bestRating: 5,
  lowPrice: 936,
  highPrice: 980,
  currency: 'TWD',
  offers: [
    { name: '實體通行證', price: 980 },
    { name: '電子通行證', price: 936 },
  ],
  cancelPolicy: '出發前一天可免費取消',
  coupons: ['TWD 200', 'TWD 600'],
  sales: '已售出 100K+',
  promo: '結帳輸入APP90 滿$1,500現折$90',
}

describe('factsToText', () => {
  it('把有值的欄位轉成條列，帶入評分/價格/折扣券', () => {
    const text = factsToText(FACTS)
    expect(text).toContain('評分：4.83 / 5，共 7228 則評論')
    expect(text).toContain('價格：TWD 936～980 起')
    expect(text).toContain('可用折扣券：TWD 200、TWD 600')
    expect(text).toContain('銷量：已售出 100K+')
    expect(text).toContain('取消政策：出發前一天可免費取消')
  })

  it('沒有的欄位不會出現（不餵 undefined 給模型）', () => {
    const bare: ProductFacts = { offers: [], coupons: [], name: '只有名字' }
    const text = factsToText(bare)
    expect(text).toBe('商品名稱：只有名字')
    expect(text).not.toContain('評分')
    expect(text).not.toContain('價格')
  })

  it('高低價相同時只顯示單一價格', () => {
    const same: ProductFacts = { ...FACTS, lowPrice: 500, highPrice: 500 }
    expect(factsToText(same)).toContain('價格：TWD 500 起')
  })
})

describe('buildInstruction', () => {
  it('要求結論先行、繁中、帶入事實，並禁止杜撰與自行算數', () => {
    const ins = buildInstruction('serious', FACTS)
    expect(ins).toContain('繁體中文')
    expect(ins).toContain('結論先行')
    expect(ins).toMatch(/不要.*計算|不要自己計算|不要杜撰|不得杜撰/)
    // 帶入語氣與事實
    expect(ins).toContain('客觀中立')
    expect(ins).toContain('4.83')
    expect(ins).toContain('TWD 600')
  })

  it('不同語氣會反映在指示中', () => {
    expect(buildInstruction('humorous', FACTS)).toContain('幽默')
    expect(buildInstruction('cynical', FACTS)).toContain('厭世')
  })

  // schema 是主要約束，但指示裡仍保留格式說明——萬一某些裝置忽略 responseConstraint，
  // 輸出至少還是可讀的「結論 + 理由」，不會比改版前更糟。
  it('仍然把三個結論選項寫進指示（降級時的退路）', () => {
    const ins = buildInstruction('serious', FACTS)
    for (const v of WORTH_SCHEMA.properties.verdict.enum) expect(ins).toContain(v)
  })
})

describe('WORTH_SCHEMA', () => {
  it('verdict 是封閉的 enum，且不用 maxLength 限制 reason（官方反模式）', () => {
    expect(WORTH_SCHEMA.properties.verdict.enum).toEqual(['值得下手', '可以考慮', '再想想'])
    expect(WORTH_SCHEMA.required).toEqual(['verdict', 'reason'])
    expect(WORTH_SCHEMA.additionalProperties).toBe(false)
    expect(JSON.stringify(WORTH_SCHEMA)).not.toContain('maxLength')
  })
})

describe('parseWorthIt', () => {
  it('完整 JSON → 取出 verdict 與 reason，組成人話', () => {
    const r = parseWorthIt('{"verdict":"值得下手","reason":"評分 4.83 很高，又有折扣券可用。"}')
    expect(r.verdict).toBe('值得下手')
    expect(r.reason).toBe('評分 4.83 很高，又有折扣券可用。')
    expect(r.text).toBe('值得下手，評分 4.83 很高，又有折扣券可用。')
  })

  it('串流途中的片段 JSON → 抽出已到齊的部分，不外洩破 JSON', () => {
    // 連欄位名都還沒收完
    expect(parseWorthIt('{"verd').text).toBe('')
    // verdict 收到一半：因為要比對 enum，半截的值不算數 → 顯示空的。
    // 這是刻意的：否則泡泡會閃「值」→「值得」→「值得下手」。
    expect(parseWorthIt('{"verdict":"值得').text).toBe('')
    // verdict 收完就先顯示結論，reason 再逐字長出來
    expect(parseWorthIt('{"verdict":"值得下手"').text).toBe('值得下手')
    const mid = parseWorthIt('{"verdict":"可以考慮","reason":"評分不錯，但價')
    expect(mid.verdict).toBe('可以考慮')
    expect(mid.text).toBe('可以考慮，評分不錯，但價')
  })

  it('裝置忽略 responseConstraint、直接吐散文 → 整段當理由（降級仍可用）', () => {
    const prose = '值得下手，這個通行證評分很高，記得用折扣券。'
    const r = parseWorthIt(prose)
    expect(r.verdict).toBeNull()
    expect(r.text).toBe(prose)
  })

  it('verdict 不在 enum 內視為沒有結論，但理由仍保留', () => {
    const r = parseWorthIt('{"verdict":"超級推薦","reason":"評分很高。"}')
    expect(r.verdict).toBeNull()
    expect(r.text).toBe('評分很高。')
  })

  it('處理轉義字元與 reason 開頭的多餘標點', () => {
    const r = parseWorthIt('{"verdict":"再想想","reason":"，價格偏高\\n建議再比較"}')
    expect(r.text).toBe('再想想，價格偏高\n建議再比較')
  })

  it('空輸出 → 全空，讓呼叫端能判斷「沒給出判斷」', () => {
    expect(parseWorthIt('   ')).toEqual({ verdict: null, reason: '', text: '' })
    expect(parseWorthIt('{"verdict":null,"reason":""}').text).toBe('')
  })
})
