import { describe, expect, it } from 'vitest'
import type { ProductFacts } from './productFacts'
import { buildFactsPrompt, buildSystemInstruction, factsToText } from './worthIt'

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

describe('buildSystemInstruction', () => {
  it('要求結論先行、繁中，並禁止杜撰與自行算數', () => {
    const ins = buildSystemInstruction('serious')
    expect(ins).toContain('繁體中文')
    expect(ins).toContain('結論先行')
    expect(ins).toMatch(/不要.*計算|不要自己計算|不要杜撰|不得杜撰/)
    expect(ins).toContain('客觀中立') // 帶入語氣
  })

  it('不同語氣會反映在指示中', () => {
    expect(buildSystemInstruction('humorous')).toContain('幽默')
    expect(buildSystemInstruction('cynical')).toContain('厭世')
  })

  it('不含商品事實（規則要能在 create() 就當 system message 送出、與事實無關）', () => {
    const ins = buildSystemInstruction('serious')
    expect(ins).not.toContain('4.83')
    expect(ins).not.toContain('TWD 600')
  })
})

describe('buildFactsPrompt', () => {
  it('只帶事實（規則已在 system message）', () => {
    const prompt = buildFactsPrompt(FACTS)
    expect(prompt).toContain('商品事實：')
    expect(prompt).toContain('4.83')
    expect(prompt).toContain('TWD 600')
    expect(prompt).not.toContain('結論先行')
  })
})
