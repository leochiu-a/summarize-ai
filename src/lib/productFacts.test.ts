import { afterEach, describe, expect, it } from 'vitest'
import { parseProductLd, readDomExtras, readProductFacts } from './productFacts'

// 取自真實 KKday 商品頁的 Product JSON-LD（精簡版）
const PRODUCT_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', name: 'KKday' },
    {
      '@type': 'MerchantReturnPolicy',
      name: '取消政策',
      description: '出發前一天可免費取消',
    },
    {
      '@type': 'Product',
      name: '釜山通行證 VISIT BUSAN PASS',
      description: '涵蓋 30+ 釜山必玩景點',
      category: '景點通票',
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: 4.83,
        reviewCount: 7228,
        bestRating: 5,
        worstRating: 1,
      },
      offers: {
        '@type': 'AggregateOffer',
        lowPrice: 936,
        highPrice: 980,
        priceCurrency: 'TWD',
        offerCount: 2,
        offers: [
          { '@type': 'Offer', name: '實體通行證', price: 980, availability: 'https://schema.org/InStock' },
          { '@type': 'Offer', name: '電子通行證', price: 936, availability: 'https://schema.org/InStock' },
        ],
      },
    },
  ],
})

afterEach(() => {
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

describe('parseProductLd', () => {
  it('從 @graph 取出 Product 的評分、價格區間與方案', () => {
    const facts = parseProductLd([PRODUCT_LD])
    expect(facts).not.toBeNull()
    expect(facts!.name).toBe('釜山通行證 VISIT BUSAN PASS')
    expect(facts!.category).toBe('景點通票')
    expect(facts!.rating).toBe(4.83)
    expect(facts!.ratingCount).toBe(7228)
    expect(facts!.bestRating).toBe(5)
    expect(facts!.lowPrice).toBe(936)
    expect(facts!.highPrice).toBe(980)
    expect(facts!.currency).toBe('TWD')
    expect(facts!.offers).toEqual([
      { name: '實體通行證', price: 980, availability: 'InStock' },
      { name: '電子通行證', price: 936, availability: 'InStock' },
    ])
    expect(facts!.cancelPolicy).toBe('出發前一天可免費取消')
  })

  it('payload 為單一物件（非 @graph）也能解析', () => {
    const single = JSON.stringify({
      '@type': 'Product',
      name: '單一節點商品',
      aggregateRating: { ratingValue: 4.2, reviewCount: 10 },
      offers: { '@type': 'Offer', price: 500, priceCurrency: 'TWD' },
    })
    const facts = parseProductLd([single])
    expect(facts!.name).toBe('單一節點商品')
    expect(facts!.rating).toBe(4.2)
    expect(facts!.lowPrice).toBe(500) // 單一 Offer 用 price 當 lowPrice
  })

  it('@type 為陣列時仍認得 Product', () => {
    const arrType = JSON.stringify({ '@type': ['Product', 'Thing'], name: '陣列型別' })
    expect(parseProductLd([arrType])!.name).toBe('陣列型別')
  })

  it('壞掉的 JSON 略過、沒有 Product 時回 null', () => {
    expect(parseProductLd(['{ not json', '[]'])).toBeNull()
    expect(parseProductLd([JSON.stringify({ '@type': 'WebPage', name: 'x' })])).toBeNull()
  })

  it('缺欄位不會 throw，只帶有值的欄位', () => {
    const minimal = JSON.stringify({ '@type': 'Product', name: '極簡' })
    const facts = parseProductLd([minimal])
    expect(facts!.name).toBe('極簡')
    expect(facts!.rating).toBeUndefined()
    expect(facts!.lowPrice).toBeUndefined()
  })
})

describe('readDomExtras', () => {
  it('抓折扣券（去重）、銷量與促銷碼', () => {
    document.body.innerHTML = `
      <div class="product-score"><span>已售出 100K+</span></div>
      <div class="coupon-ticket__content">TWD 200</div>
      <div class="coupon-ticket__content">TWD 600</div>
      <div class="coupon-ticket__content">TWD 200</div>
      <span class="promotion__text">結帳輸入APP90 滿$1,500現折$90！</span>`
    const extras = readDomExtras()
    expect(extras.coupons).toEqual(['TWD 200', 'TWD 600'])
    expect(extras.sales).toBe('已售出 100K+')
    expect(extras.promo).toContain('APP90')
  })

  it('沒有補充資料時回空、不 throw', () => {
    document.body.innerHTML = '<div>沒有券也沒有銷量</div>'
    const extras = readDomExtras()
    expect(extras.coupons).toEqual([])
    expect(extras.sales).toBeUndefined()
    expect(extras.promo).toBeUndefined()
  })
})

describe('readProductFacts', () => {
  it('合併 JSON-LD 主來源與 DOM 補充', () => {
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.textContent = PRODUCT_LD
    document.head.appendChild(script)
    document.body.innerHTML = `<div class="coupon-ticket__content">TWD 600</div>`

    const facts = readProductFacts()
    expect(facts).not.toBeNull()
    expect(facts!.rating).toBe(4.83)
    expect(facts!.coupons).toEqual(['TWD 600'])
  })

  it('沒有 Product JSON-LD 時回 null', () => {
    document.body.innerHTML = `<div class="coupon-ticket__content">TWD 600</div>`
    expect(readProductFacts()).toBeNull()
  })
})
