import { afterEach, describe, expect, it } from 'vitest'
import { findPackageSection, readPackageAvailability, readSelectedDate } from './packageAvailability'

afterEach(() => {
  document.body.innerHTML = ''
})

// ── Fixture A：一日遊型（對照實機 12319，Chrome 151 走查 2026-07-28）─────────
// 方案是 radio chip：`.tag-badge-wrapper > .kk-chip`，名稱在 `.kk-chip__label`，
// badge 在 wrapper 內、label 外。標題是 h4.package-section-title 且不在 .info-section 裡。
// 實機確認 chip 上沒有 role / aria-checked / aria-selected / tabindex。
function renderTourChips(opts: { blockedAria?: boolean; withAria?: boolean } = {}) {
  const aria = opts.blockedAria ? 'aria-disabled="true"' : ''
  const radioAttrs = opts.withAria ? 'role="radio" aria-checked="false"' : ''
  document.body.innerHTML = `
    <div class="layout-grid">
      <h4 class="package-section-title">選擇方案</h4>
      <div class="dates">
        <div class="kk-chip kk-chip--selected date-chip"><div class="kk-chip__label">7月30 週四</div></div>
        <div class="kk-chip date-chip"><div class="kk-chip__label">7月31 週五</div></div>
      </div>
      <div class="tag-badge-wrapper">
        <div class="kk-chip kk-chip--lg kk-chip--selected custom-chip" ${radioAttrs}>
          <div class="kk-chip__label">【兩人同行優惠】中文導覽服務｜河口湖・新倉山淺間公園</div>
        </div><span class="badge">50% OFF</span>
      </div>
      <div class="tag-badge-wrapper">
        <div class="kk-chip kk-chip--lg custom-chip" ${aria}>
          <div class="kk-chip__label">【冬春季限定】新倉山淺間公園＆忍野八海＆天上山公園纜車</div>
        </div><span class="badge">該日期無法訂購</span>
      </div>
      <div class="tag-badge-wrapper">
        <div class="kk-chip kk-chip--lg custom-chip">
          <div class="kk-chip__label">富士山五合目＆小御嶽神社＆四合目雲海</div>
        </div><span class="badge">33% OFF</span>
      </div>
      <div>總金額 NT$ 2,840</div>
    </div>
  `
}

// ── Fixture B：票券型（對照實機 133300 澀谷SKY）───────────────────────────
// 方案是整張卡：`.option-content` / `.option-head`，卡內有 `button.select-option`
//（文字「選擇 / 取消選擇 / 已售罄」）。這型頁面完全沒有 .tag-badge-wrapper。
function renderTicketCards(opts: { soldOutAria?: boolean } = {}) {
  const aria = opts.soldOutAria ? 'aria-disabled="true"' : ''
  document.body.innerHTML = `
    <div class="info-section">
      <h2 class="info-title">景點門票</h2>
      <div class="option-head"><div class="option-content is-not-expanded">
        <h3 class="option-title">澀谷SKY 展望台門票（成人）</h3>
        <p>現場請出示 QR code・1 天前可免費取消・簽約書條文若干</p>
        <span>NT$534</span>
        <div class="option-action__body"><button class="kk-button select-option">選擇</button></div>
      </div></div>
      <div class="option-head"><div class="option-content is-not-expanded">
        <h3 class="option-title">澀谷SKY 展望台門票（含紀念品）</h3>
        <p>含限定紀念品一份，數量有限</p>
        <span>NT$880</span>
        <div class="option-action__body"><button class="kk-button select-option" ${aria}>已售罄</button></div>
      </div></div>
    </div>
  `
}

describe('findPackageSection', () => {
  it('一日遊型：認得 h4.package-section-title（不在 .info-section 裡）', () => {
    renderTourChips()
    const sec = findPackageSection()
    expect(sec).not.toBeNull()
    expect(sec!.querySelectorAll('.tag-badge-wrapper').length).toBe(3)
  })

  it('票券型：用 h2「景點門票」反查 .info-section', () => {
    renderTicketCards()
    expect(findPackageSection()?.querySelectorAll('button.select-option').length).toBe(2)
  })

  it('四種標題名稱都認得（同一功能站內有四個名字）', () => {
    for (const title of ['選擇方案', '景點門票', '觀光行程', '選擇票種']) {
      document.body.innerHTML = `<div class="info-section"><h2>${title}</h2></div>`
      expect(findPackageSection(), title).not.toBeNull()
    }
  })

  it('沒有方案區時回 null', () => {
    document.body.innerHTML = '<div class="info-section"><h2>商品說明</h2></div>'
    expect(findPackageSection()).toBeNull()
    expect(readPackageAvailability()).toBeNull()
  })
})

describe('readSelectedDate', () => {
  it('讀出選中的日期 chip', () => {
    renderTourChips()
    expect(readSelectedDate()).toBe('7月30')
  })

  it('票券型沒有全域日期選擇器時回 null', () => {
    renderTicketCards()
    expect(readSelectedDate()).toBeNull()
  })
})

describe('readPackageAvailability — 一日遊型（chip）', () => {
  it('認出 uiPattern，讀出 3 個方案與選中狀態', () => {
    renderTourChips()
    const r = readPackageAvailability()!
    expect(r.uiPattern).toBe('tour-chip')
    expect(r.packages).toHaveLength(3)
    expect(r.packages[0].selected).toBe(true)
    expect(r.packages[1].selected).toBe(false)
    expect(r.packages[0].name).toContain('兩人同行優惠')
  })

  it('badge 文字反解成狀態，折扣 badge 不會被誤判成不可訂', () => {
    renderTourChips()
    const r = readPackageAvailability()!
    expect(r.packages[0].status).toBe('selectable')
    expect(r.packages[1].status).toBe('unavailable_on_date')
    expect(r.packages[1].statusText).toBe('該日期無法訂購')
    expect(r.packages[2].status).toBe('selectable')
  })

  it('「不可訂但仍可點」進 warnings —— 走查抓到的循環死巷', () => {
    renderTourChips()
    const r = readPackageAvailability()!
    expect(r.packages[1].clickable).toBe(true)
    expect(r.warnings.some((w) => w.includes('仍可點擊'))).toBe(true)
  })

  it('補上 aria-disabled 後，那筆 warning 消失（修好之後的樣子）', () => {
    renderTourChips({ blockedAria: true })
    const r = readPackageAvailability()!
    expect(r.packages[1].clickable).toBe(false)
    expect(r.warnings.filter((w) => w.includes('仍可點擊'))).toHaveLength(0)
  })

  it('chip 完全沒有 a11y 語意時另外舉手（實機確認的問題，比缺 aria-disabled 更嚴重）', () => {
    renderTourChips()
    expect(readPackageAvailability()!.warnings.some((w) => w.includes('a11y'))).toBe(true)
  })

  it('chip 有 role/aria-checked 後就不再舉手', () => {
    renderTourChips({ withAria: true })
    expect(readPackageAvailability()!.warnings.some((w) => w.includes('a11y'))).toBe(false)
  })
})

describe('readPackageAvailability — 票券型（card）', () => {
  it('認出 uiPattern，用 .option-content 當卡片邊界', () => {
    renderTicketCards()
    const r = readPackageAvailability()!
    expect(r.uiPattern).toBe('ticket-card')
    expect(r.packages).toHaveLength(2)
    expect(r.packages.map((p) => p.name)).toEqual([
      '澀谷SKY 展望台門票（成人）',
      '澀谷SKY 展望台門票（含紀念品）',
    ])
  })

  it('價格原樣保留字串，不重算', () => {
    renderTicketCards()
    expect(readPackageAvailability()!.packages[0].price).toBe('NT$534')
  })

  it('已售罄分類正確，且仍可點會舉手', () => {
    renderTicketCards()
    const r = readPackageAvailability()!
    expect(r.packages[1].status).toBe('sold_out')
    expect(r.warnings.some((w) => w.includes('sold_out'))).toBe(true)
  })

  it('售罄按鈕加上 aria-disabled 後就不舉手', () => {
    renderTicketCards({ soldOutAria: true })
    const r = readPackageAvailability()!
    expect(r.packages[1].clickable).toBe(false)
    expect(r.warnings.filter((w) => w.includes('仍可點擊'))).toHaveLength(0)
  })

  it('票券型不會誤觸發 chip 的 a11y warning', () => {
    renderTicketCards()
    expect(readPackageAvailability()!.warnings.some((w) => w.includes('a11y'))).toBe(false)
  })

  it('class 改版時退回按鈕文字反查，仍抓得到方案', () => {
    document.body.innerHTML = `
      <div class="info-section"><h2>景點門票</h2>
        <div class="renamed-card"><h3>方案 A</h3><p>一些說明文字讓這張卡有足夠長度可以被認出來</p>
          <span>NT$100</span><button class="kk-button">選擇</button></div>
      </div>`
    const r = readPackageAvailability()!
    expect(r.packages).toHaveLength(1)
    expect(r.packages[0].name).toBe('方案 A')
  })

  it('找到方案區但讀不出卡片時，誠實回報選擇器可能失效', () => {
    document.body.innerHTML = '<div class="info-section"><h2>選擇方案</h2><p>改版了</p></div>'
    const r = readPackageAvailability()!
    expect(r.packages).toHaveLength(0)
    expect(r.warnings.some((w) => w.includes('選擇器可能已失效'))).toBe(true)
  })
})
