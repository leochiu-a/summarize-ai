import { afterEach, describe, expect, it } from 'vitest'
import {
  extractDescText,
  findDescSection,
  findReviewButtonAnchor,
  findReviewSection,
  findReviewTitle,
  getProductId,
  isProductPage,
  onRouteChange,
} from './productPage'

function setPath(path: string) {
  window.history.replaceState({}, '', path)
}

afterEach(() => {
  document.body.innerHTML = ''
  setPath('/')
})

describe('isProductPage / getProductId', () => {
  it('/zh-tw/product/<id> 視為商品頁', () => {
    setPath('/zh-tw/product/138477-visit-busan-pass')
    expect(isProductPage()).toBe(true)
    expect(getProductId()).toBe('138477')
  })

  it('無 locale 前綴也認得', () => {
    setPath('/product/999')
    expect(isProductPage()).toBe(true)
    expect(getProductId()).toBe('999')
  })

  it('非商品頁回 false / null', () => {
    setPath('/zh-tw/category/tours')
    expect(isProductPage()).toBe(false)
    expect(getProductId()).toBeNull()
  })
})

describe('findDescSection / extractDescText', () => {
  const longText =
    '通行證涵蓋多處必訪景點，包括甘川洞文化村、札嘎其市場、海雲台、廣安大橋，讓你深入探索釜山的文化與現代魅力，還能享有多處景點與商店的專屬折扣與入場優惠。'

  it('用 #product-info-sec 定位，並抽出去掉標題/雜訊的內文', () => {
    document.body.innerHTML = `
      <div id="product-info-sec" class="info-section">
        <h2 class="info-title">商品說明</h2>
        <div class="info-sec-collapsable">
          <p>${longText}</p>
          <script>window.__NUXT__ = 1</script>
          <button>展開更多</button>
        </div>
      </div>`
    const section = findDescSection()
    expect(section).toBeTruthy()

    const text = extractDescText(section!)
    expect(text).toContain('甘川洞文化村')
    expect(text).not.toContain('商品說明') // 標題被移除
    expect(text).not.toContain('__NUXT__') // script 被移除
    expect(text).not.toContain('展開更多') // button 被移除
  })

  it('沒有 id 時退回用標題文字反查外框', () => {
    document.body.innerHTML = `
      <div class="info-section">
        <h2 class="info-title">商品說明</h2>
        <div><p>${longText}</p></div>
      </div>`
    const section = findDescSection()
    expect(section?.classList.contains('info-section')).toBe(true)
  })
})

describe('findReviewSection / findReviewTitle', () => {
  it('用 #review-sec 定位評論區，並取得標題節點', () => {
    document.body.innerHTML = `
      <div id="review-sec" class="info-section review-section">
        <h2 class="info-title">Reviews</h2>
        <div class="review-section__comments"></div>
      </div>`
    const section = findReviewSection()
    expect(section?.id).toBe('review-sec')
    expect(findReviewTitle(section!)?.textContent).toBe('Reviews')
  })

  it('沒有 id 時退回用「Reviews / 評論」標題反查外框', () => {
    document.body.innerHTML = `
      <div class="info-section">
        <h2 class="info-title">評論</h2>
      </div>`
    const section = findReviewSection()
    expect(section?.classList.contains('info-section')).toBe(true)
  })

  it('沒有評論區時回 null', () => {
    document.body.innerHTML = `<div class="info-section"><h2>商品說明</h2></div>`
    expect(findReviewSection()).toBeNull()
  })
})

describe('findReviewButtonAnchor', () => {
  it('有評論列表時 → 錨定列表、插在它前面（評分之後、列表之上，不切斷標題→評分）', () => {
    document.body.innerHTML = `
      <div id="review-sec" class="info-section review-section">
        <h2 class="info-title">Reviews</h2>
        <div class="review-section__header-container">4.8 Excellent</div>
        <div class="review-section__comments"></div>
      </div>`
    const anchor = findReviewButtonAnchor(findReviewSection()!)
    expect(anchor?.position).toBe('before')
    expect(anchor?.node.classList.contains('review-section__comments')).toBe(true)
  })

  it('沒有評論列表時 → 退回標題、插在它後面', () => {
    document.body.innerHTML = `
      <div id="review-sec" class="info-section">
        <h2 class="info-title">Reviews</h2>
      </div>`
    const anchor = findReviewButtonAnchor(findReviewSection()!)
    expect(anchor?.position).toBe('after')
    expect(anchor?.node.tagName).toBe('H2')
  })
})

describe('onRouteChange', () => {
  it('pathname 變動時觸發（pushState）', () => {
    setPath('/zh-tw/product/1')
    let hits = 0
    const off = onRouteChange(() => {
      hits += 1
    })

    window.history.pushState({}, '', '/zh-tw/product/2')
    expect(hits).toBe(1)

    // 同一 pathname（只變 query）不觸發
    window.history.pushState({}, '', '/zh-tw/product/2?groupOid=9')
    expect(hits).toBe(1)

    off()
    window.history.pushState({}, '', '/zh-tw/product/3')
    expect(hits).toBe(1) // 解除後不再觸發
  })
})
