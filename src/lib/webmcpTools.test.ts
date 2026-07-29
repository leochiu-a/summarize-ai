import { afterEach, describe, expect, it, vi } from 'vitest'
import { ALL_TOOLS, MAX_OUTPUT_CHARS, SEARCH_OUTPUT_CHARS, cap, toolsForCurrentPage } from './webmcpTools'

function setPath(path: string) {
  window.history.replaceState({}, '', path)
}

function run(name: string, input: Record<string, unknown> = {}) {
  const tool = ALL_TOOLS.find((t) => t.name === name)!
  return tool.execute(input) as Promise<string>
}

afterEach(() => {
  document.body.innerHTML = ''
  setPath('/')
})

function renderProductPage() {
  setPath('/zh-tw/product/12319')
  document.body.innerHTML = `
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: '富士山河口湖一日遊',
      category: '一日遊',
      aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.7, reviewCount: 14563, bestRating: 5 },
      offers: { '@type': 'AggregateOffer', lowPrice: 1234, highPrice: 2580, priceCurrency: 'TWD' },
    })}</script>
    <div class="info-section"><h2 class="info-title">商品說明</h2><p>${'從東京出發的富士山經典路線。'.repeat(20)}</p></div>
    <div class="info-section"><h2 class="info-title">購買須知</h2><p>${'恕不退款，遇天候不佳我司不承擔責任。'.repeat(30)}</p></div>
    <div class="info-section"><h2 class="info-title">常見問題</h2><p>Q：可以帶寵物嗎？A：不可，本行程全程禁止攜帶寵物同行。Q：可以指定座位嗎？A：座位由現場安排。</p></div>
    <div class="info-section">
      <h2 class="info-title">選擇方案</h2>
      <div class="pkg"><h3>【兩人同行優惠】</h3><p>含中文導覽，10 小時行程</p><span>NT$1,234</span><button>選擇</button></div>
      <div class="pkg"><h3>【冬春季限定】</h3><p>冬春季出發，含中文導覽</p><span>該日期無法訂購</span><button>選擇</button></div>
    </div>
    <div class="info-section" id="review-sec">
      <h2 class="info-title">評論</h2>
      <div class="ai"><p>✨AI 精選旅客評論摘要：多數旅客認為風景值得，少數反映車程偏長。</p></div>
      <button>導遊</button><button>景點</button><button>餐點</button><button>翻譯所有評論</button>
      <div class="product-comment-content">
        <div class="product-comment-content__title">很值得</div>
        <div class="product-comment-content__body">導遊很細心，行程順暢。</div>
      </div>
    </div>
  `
}

describe('cap', () => {
  it('短輸出原樣回傳', () => {
    expect(cap('hello')).toBe('hello')
  })

  it('超長輸出會截斷，並誠實標註總長度（截斷不標註 agent 會拿殘缺當完整）', () => {
    const out = cap('あ'.repeat(5000))
    expect(out.length).toBeLessThanOrEqual(MAX_OUTPUT_CHARS)
    expect(out).toContain('[truncated: 5000 chars total]')
  })
})

describe('toolsForCurrentPage', () => {
  it('search_products 全站都註冊 —— discovery 卡在首頁與列表頁，不是商品頁', () => {
    for (const path of ['/zh-tw', '/zh-tw/destination/jp-tokyo', '/zh-tw/product/productlist/東京']) {
      setPath(path)
      expect(toolsForCurrentPage().map((t) => t.name), path).toEqual(['search_products'])
    }
  })

  it('商品頁只多一支可訂性 tool —— benchmark 之後從 7 支砍到 2 支', () => {
    renderProductPage()
    expect(toolsForCurrentPage().map((t) => t.name)).toEqual(['search_products', 'check_package_availability'])
  })

  it('評論撰寫頁不再有專屬 tool，只剩全站的 search', () => {
    setPath('/zh-tw/order/comment/25KK268720222')
    expect(toolsForCurrentPage().map((t) => t.name)).toEqual(['search_products'])
  })

  it('全部都是唯讀 —— 砍掉 write_review_draft 之後沒有任何會改狀態的 tool', () => {
    expect(ALL_TOOLS.every((t) => t.annotations?.readOnlyHint === true)).toBe(true)
  })

  it('任何頁面同時註冊的 tool 都不超過 Chrome 建議的 5–10 支', () => {
    for (const path of ['/zh-tw', '/zh-tw/product/12319', '/zh-tw/order/comment/1']) {
      setPath(path)
      expect(toolsForCurrentPage().length, path).toBeLessThanOrEqual(10)
    }
  })
})

describe('search_products 的 schema 不收個人條件（spec §6.3.3 over-parameterization）', () => {
  it('沒有年齡 / 同行人 / 身心狀況這類參數', () => {
    const tool = ALL_TOOLS.find((t) => t.name === 'search_products')!
    const keys = Object.keys((tool.inputSchema as { properties: Record<string, unknown> }).properties)
    expect(keys).toEqual(['keyword', 'minRating', 'minReviews', 'sort', 'limit'])
    expect(keys.some((k) => /age|child|kid|pregnan|disab|gender|health/i.test(k))).toBe(false)
  })

  it('schema 裡沒有 maxPrice / availableFrom —— 只留兩個站得住的維度', () => {
    const tool = ALL_TOOLS.find((t) => t.name === 'search_products')!
    const props = (tool.inputSchema as { properties: Record<string, unknown> }).properties
    for (const k of ['maxPrice', 'availableFrom', 'category']) expect(k in props, k).toBe(false)
  })

  it('schema 裡沒有 category —— 它會回假 0 筆，比沒有這個 filter 危險', () => {
    const tool = ALL_TOOLS.find((t) => t.name === 'search_products')!
    expect('category' in (tool.inputSchema as { properties: Record<string, unknown> }).properties).toBe(false)
  })

  it('是唯讀的（搜尋不該改任何狀態）', () => {
    const tool = ALL_TOOLS.find((t) => t.name === 'search_products')!
    expect(tool.annotations?.readOnlyHint).toBe(true)
    expect(tool.annotations?.untrustedContentHint).toBe(true)
  })
})

describe('tool 定義符合 Chrome 的字元預算與命名規則', () => {
  it.each(ALL_TOOLS)('$name', (tool) => {
    expect(tool.name).toMatch(/^[A-Za-z0-9_.-]+$/)
    expect(tool.name.length).toBeLessThanOrEqual(30)
    expect(tool.description.length).toBeLessThanOrEqual(500)
    expect(tool.annotations).toBeDefined()
    for (const prop of Object.values(
      (tool.inputSchema as { properties?: Record<string, { description?: string }> } | undefined)?.properties ?? {},
    )) {
      expect(prop.description?.length ?? 0).toBeLessThanOrEqual(150)
    }
  })

  it('tool 名稱不重複（同名註冊會被 spec 擋成 InvalidStateError）', () => {
    expect(new Set(ALL_TOOLS.map((t) => t.name)).size).toBe(ALL_TOOLS.length)
  })

  it('輸出含 UGC / 供應商文案的 tool 標 untrustedContentHint', () => {
    expect(ALL_TOOLS.find((t) => t.name === 'search_products')!.annotations?.untrustedContentHint).toBe(true)
  })

  it('只剩 2 支 —— tool 越少 agent 選對的機率越高', () => {
    expect(ALL_TOOLS.map((t) => t.name)).toEqual(['search_products', 'check_package_availability'])
  })

  it('沒有任何送出訂單 / 付款的 tool', () => {
    expect(ALL_TOOLS.some((t) => /submit|pay|checkout|order/.test(t.name))).toBe(false)
  })
})

describe('search_products 的輸出永遠是合法 JSON（實測抓到的最嚴重 bug）', () => {
  // 原本對 JSON 直接套 cap()，把字串切在 JSON 中間 → agent 拿到
  // 「Unterminated string in JSON at position 1490」，只能改用 regex 硬抽欄位，
  // 於是 matched:43 裡有 37 筆永遠看不到、limit:20 實際只拿到 6 筆。
  function mockManyProducts() {
    const items = Array.from({ length: 20 }, (_, i) => ({
      prod_oid: `p${i}`,
      // 刻意用長名稱把輸出撐爆
      name: `【超長商品名稱測試】東京近郊富士山河口湖忍野八海大石公園一日遊含中文導覽第 ${i} 團`,
      rating_star: 4.9 - i * 0.01,
      rating_count: 5000 - i,
      min_price: 1000 + i,
      currency: 'TWD',
      earliest_sale_date: '20260729',
      readable_url: `product-with-a-fairly-long-readable-slug-number-${i}`,
      display_tags: ['立即確認', '1天前可免費取消'],
    }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: { data: items, total: 590, total_page: 30, page: 1 } }),
      }) as unknown as Response),
    )
  }

  afterEach(() => vi.unstubAllGlobals())

  it('limit=20 且名稱很長時，輸出仍可 JSON.parse，不會被切在字串中間', async () => {
    setPath('/zh-tw')
    mockManyProducts()
    const out = await run('search_products', { keyword: '東京', limit: 20 })
    expect(out.length).toBeLessThanOrEqual(SEARCH_OUTPUT_CHARS)
    const parsed = JSON.parse(out) // 這行是重點：以前會 throw
    expect(Array.isArray(parsed.products)).toBe(true)
    expect(parsed.products.length).toBeGreaterThan(0)
  })

  it('預設 limit（12 筆）在正常名稱長度下塞得進 search 的預算', async () => {
    setPath('/zh-tw')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: {
            data: Array.from({ length: 20 }, (_, i) => ({
              prod_oid: `p${i}`,
              name: '【50% OFF】日本 eSIM 無限流量 Softbank',
              rating_star: 4.09,
              rating_count: 20003,
              min_price: 16,
              max_price: 1841,
              currency: 'TWD',
              discount: 0.5,
              earliest_sale_date: '20260728',
            })),
            total: 569,
            total_page: 29,
            page: 1,
          },
        }),
      }) as unknown as Response),
    )
    const parsed = JSON.parse(await run('search_products', { keyword: '日本esim' }))
    expect(parsed.products).toHaveLength(12)
    expect(parsed.omittedForLength).toBeUndefined()
    expect(parsed.urlPattern).toContain('{id}')
  })

  it('因長度砍掉筆數時要誠實回報 omittedForLength，而不是默默少給', async () => {
    setPath('/zh-tw')
    mockManyProducts()
    const parsed = JSON.parse(await run('search_products', { keyword: '東京', limit: 20 }))
    // limit=20 → 最多 20 筆進輸出；因長度砍掉的筆數必須被誠實回報
    expect(parsed.omittedForLength).toBe(20 - parsed.products.length)
    expect(parsed.omittedForLength).toBeGreaterThan(0)
  })

  it('欄位叫 priceFrom，而且一定附上「起價不等於當天價」的警告', async () => {
    setPath('/zh-tw')
    mockManyProducts()
    const parsed = JSON.parse(await run('search_products', { keyword: '東京', limit: 2 }))
    expect(parsed.products[0]).toHaveProperty('priceFrom')
    expect(parsed.products[0]).not.toHaveProperty('price')
    expect(parsed.notes.some((n: string) => n.includes('起價'))).toBe(true)
  })

  it('0 筆結果不亂猜原因（以前會誤導成「放寬評分或預算」）', async () => {
    setPath('/zh-tw')
    mockManyProducts()
    const parsed = JSON.parse(await run('search_products', { keyword: '東京', minRating: 5, minReviews: 999999 }))
    expect(parsed.matched).toBe(0)
    expect(parsed.error).toContain('掃過的')
    expect(parsed.error).not.toContain('放寬評分或預算，或改用更廣的關鍵字再試一次')
  })
})

describe('check_package_availability（改打可訂性 API）', () => {
  // 實測發現的關鍵事實：DOM 版回報四個方案全部 selectable，但 API 顯示其中一個
  // （冬春季限定）整個 8 月完全不可訂 —— 畫面上它是個可點的 chip、沒有任何 badge。
  // 所以這支改成打 API，DOM 只留著做交叉檢核。
  function stubPayload() {
    ;(window as unknown as { __NUXT__: unknown }).__NUXT__ = {
      state: {
        product: {
          packages: [
            { pkg_oid: 1964950, name: '【兩人同行優惠】河口湖散步方案', items: [1710727] },
            { pkg_oid: 1986735, name: '【冬春季限定】新倉山＋纜車', items: [1212306] },
          ],
        },
      },
    }
  }
  function stubApi(perPkg: Record<number, Record<string, { is_saleable: boolean; is_sold_out: boolean; remain_qty?: unknown }>>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const pkgOid = Number(new URL(String(input), 'https://www.kkday.com').searchParams.get('pkgOid'))
        const itemOid = new URL(String(input), 'https://www.kkday.com').searchParams.get('itemOidList[]')
        return {
          ok: true,
          json: async () => ({ data: { [String(itemOid)]: { calendar: perPkg[pkgOid] ?? {} } } }),
        } as unknown as Response
      }),
    )
  }
  const day = (saleable: boolean, remain?: number) => ({
    is_saleable: saleable,
    is_sold_out: false,
    ...(remain != null ? { remain_qty: { fullday: remain } } : {}),
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete (window as unknown as { __NUXT__?: unknown }).__NUXT__
  })

  it('問單一日期時，逐方案回可訂與否 + 剩餘數量', async () => {
    renderProductPage()
    stubPayload()
    stubApi({
      1964950: { '2026-08-15': day(true, 41) },
      1986735: { '2026-08-15': day(false) },
    })
    const out = JSON.parse(await run('check_package_availability', { date: '2026-08-15' }))
    expect(out.productId).toBe('12319')
    // remain 依票種（itemOid）分開保留，不加總 —— 見 DayAvailability.remain
    expect(out.bookable).toEqual([
      { package: '【兩人同行優惠】河口湖散步方案', remain: { 1710727: { fullday: 41 } } },
    ])
    expect(out.notBookable).toEqual(['【冬春季限定】新倉山＋纜車'])
    expect(out.couldNotCheck).toBeUndefined()
  })

  // 這是 code review 抓到的 Critical：原本 days.find() 回 undefined 時會落進 else 被當成
  // 「不可訂」，於是 agent 會自信地告訴使用者某方案訂不到 —— 但我們其實只是沒拿到資料。
  it('API 沒回該日期的資料時歸到 couldNotCheck，不能說成不可訂', async () => {
    renderProductPage()
    stubPayload()
    stubApi({
      1964950: { '2026-08-15': day(true, 41) },
      1986735: {}, // 這個方案 API 完全沒回 8/15 的 entry
    })
    const out = JSON.parse(await run('check_package_availability', { date: '2026-08-15' }))
    expect(out.notBookable).toEqual([])
    expect(out.couldNotCheck).toEqual(['【冬春季限定】新倉山＋纜車'])
    expect(out.notes.join('')).toContain('不等於不可訂')
  })

  it('不可訂的方案一定附上「畫面上仍可點」的警告 —— 這是循環死巷 bug', async () => {
    renderProductPage()
    stubPayload()
    stubApi({ 1964950: { '2026-08-15': day(true, 5) }, 1986735: { '2026-08-15': day(false) } })
    const out = JSON.parse(await run('check_package_availability', { date: '2026-08-15' }))
    expect(out.notes.some((n: string) => n.includes('畫面上這些方案通常仍是可點的'))).toBe(true)
  })

  it('剩餘數量要附上「不是保證」的提醒（庫存隨時變動）', async () => {
    renderProductPage()
    stubPayload()
    stubApi({ 1964950: { '2026-08-15': day(true, 41) }, 1986735: { '2026-08-15': day(true, 2) } })
    const out = JSON.parse(await run('check_package_availability', { date: '2026-08-15' }))
    expect(out.notes.some((n: string) => n.includes('不要當成保證'))).toBe(true)
  })

  it('不給日期時回整段範圍，並標出「整段都不可訂」的方案', async () => {
    renderProductPage()
    stubPayload()
    stubApi({
      1964950: { '2026-08-01': day(true, 40), '2026-08-02': day(false), '2026-08-03': day(true, 12) },
      1986735: { '2026-08-01': day(false), '2026-08-02': day(false), '2026-08-03': day(false) },
    })
    const out = JSON.parse(await run('check_package_availability', { from: '2026-08-01', to: '2026-08-03' }))
    expect(out.range).toBe('2026-08-01 ~ 2026-08-03')
    const dead = out.packages.find((p: { fullyUnavailable?: boolean }) => p.fullyUnavailable)
    expect(dead.package).toContain('冬春季限定')
    expect(dead.bookableCount).toBe(0)
    expect(out.notes.some((n: string) => n.includes('完全不可訂'))).toBe(true)
  })

  it('日期格式錯誤時回可自我修正的訊息，不 throw', async () => {
    renderProductPage()
    stubPayload()
    const out = JSON.parse(await run('check_package_availability', { date: '8/15' }))
    expect(out.error).toContain('YYYY-MM-DD')
  })

  it('不在商品頁時明講要先導航', async () => {
    setPath('/zh-tw')
    const out = JSON.parse(await run('check_package_availability', {}))
    expect(out.error).toContain('/product/<id>')
  })

  it('讀不到 payload 時不假裝有答案', async () => {
    renderProductPage()
    const out = JSON.parse(await run('check_package_availability', { date: '2026-08-15' }))
    expect(out.error).toContain('讀不到這個商品的方案資料')
  })

  it('單一方案查詢失敗不會讓整個矩陣消失', async () => {
    renderProductPage()
    stubPayload()
    let call = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        call += 1
        if (call === 1) return { ok: false, status: 500 } as unknown as Response
        const itemOid = new URL(String(input), 'https://www.kkday.com').searchParams.get('itemOidList[]')
        return {
          ok: true,
          json: async () => ({ data: { [String(itemOid)]: { calendar: { '2026-08-01': day(true, 9) } } } }),
        } as unknown as Response
      }),
    )
    const out = JSON.parse(await run('check_package_availability', { from: '2026-08-01', to: '2026-08-01' }))
    expect(out.packages).toHaveLength(2)
    expect(out.packages.some((p: { error?: string }) => p.error?.includes('500'))).toBe(true)
    expect(out.notes.some((n: string) => n.includes('查詢失敗'))).toBe(true)
  })
})
