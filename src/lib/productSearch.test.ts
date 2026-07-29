import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_MAX_PAGES, HARD_MAX_PAGES, PAGE_SIZE, normalizeHit, searchProducts } from './productSearch'

// 對照實機觀察到的 response 欄位名（ajax_get_product_list 的 data[] 元素）
function apiItem(over: Record<string, unknown> = {}) {
  return {
    // ⚠️ 實機是 **number**，不是 string。這裡原本寫 '12319'，害 normalizeHit 的
    // id 檢查在測試裡永遠通過、在真站上永遠回 null（scanned: 0）。型別要跟實機一致。
    prod_mid: 19252,
    prod_oid: 12319,
    name: '富士山河口湖一日遊',
    introduction: '從東京出發',
    rating_star: 4.7,
    rating_count: 14563,
    // 實機是給人看的縮寫字串（'300K+' / '5K+' / '900'），不是純數字
    show_order_count: '300K+',
    // 實機格式是緊湊的 YYYYMMDD，不是 YYYY-MM-DD —— 這個 mock 一開始寫錯，
    // 導致日期篩選在真頁面上永遠命中 0 卻測不出來
    earliest_sale_date: '20260730',
    sale_status: 'ON_SALE',
    readable_url: '12319-mtfuji-day-tour',
    product_category: '一日遊',
    display_tags: [{ name: '中文導覽' }, '免費取消'],
    currency: 'TWD',
    official_price: 2841,
    min_price: 1420,
    max_price: 2841,
    discount: '50%',
    ...over,
  }
}

const calls: string[] = []
// ⚠️ 對齊**實機驗證過的巢狀形狀**：`{ data: { data: [...], total, total_page } }`。
// 最初這個 mock 寫成扁平的 `{ data: [...] }`，測試全綠但真頁面直接炸 ——
// mock 只能驗證「你以為的形狀」，所以形狀本身必須來自實機觀察。
function mockApi(pages: Record<string, unknown>[][], total = 590) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      calls.push(String(input))
      const url = new URL(String(input), 'https://www.kkday.com')
      const page = Number(url.searchParams.get('page'))
      const count = Number(url.searchParams.get('count'))
      const items = pages[page - 1] ?? []
      return {
        ok: true,
        json: async () => ({
          status: 'success',
          isSuccess: true,
          data: {
            status: 'success',
            data: items,
            total,
            saleable_product_count: total,
            page,
            total_page: Math.ceil(total / count),
            entity_types: ['PRODUCT'],
          },
        }),
      } as unknown as Response
    }),
  )
}
const fullPage = (over: (i: number) => Record<string, unknown> = () => ({})) =>
  Array.from({ length: PAGE_SIZE }, (_, i) => apiItem({ prod_oid: `p${i}`, ...over(i) }))

beforeEach(() => {
  calls.length = 0
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('normalizeHit', () => {
  it('對齊實機欄位名，把 rating_star / earliest_sale_date 等取出來', () => {
    const h = normalizeHit(apiItem())!
    expect(h).toMatchObject({
      id: '12319',
      name: '富士山河口湖一日遊',
      rating: 4.7,
      ratingCount: 14563,
      priceFrom: 1420,
      priceTo: 2841,
      earliestDate: '2026-07-30',
      currency: 'TWD',
    })
    // official_price 刻意不轉述 —— 實測 KDDI eSIM 的 min=178 但 official=2，資料是壞的
    expect('officialPrice' in normalizeHit(apiItem())!).toBe(false)
  })

  it('display_tags 同時吃字串與物件兩種形狀', () => {
    expect(normalizeHit(apiItem())!.tags).toEqual(['中文導覽', '免費取消'])
  })

  it('緊湊日期 YYYYMMDD 會被正規化成 YYYY-MM-DD（實機就是這個格式）', () => {
    expect(normalizeHit(apiItem({ earliest_sale_date: '20260729' }))!.earliestDate).toBe('2026-07-29')
  })

  it('已經是 YYYY-MM-DD 的也照收，讀不懂的格式回 undefined 而不是硬塞', () => {
    expect(normalizeHit(apiItem({ earliest_sale_date: '2026-08-01' }))!.earliestDate).toBe('2026-08-01')
    expect(normalizeHit(apiItem({ earliest_sale_date: '即日起' }))!.earliestDate).toBeUndefined()
  })

  it('缺 id 或 name 的髒資料回 null，不讓它進結果', () => {
    expect(normalizeHit({ name: '沒有 id' })).toBeNull()
    expect(normalizeHit({ prod_oid: '1' })).toBeNull()
  })

  // 迴歸測試：實機的 prod_oid / prod_mid 是 number。之前 id 只收 string，
  // 導致每一筆都被判成髒資料 → scanned: 0，而診斷卻說「陣列長度 20」。
  it('數字型別的 prod_oid / prod_mid 也要收（實機就是 number）', () => {
    expect(normalizeHit({ prod_oid: 133300, name: '澀谷SHIBUYA SKY展望台門票' })!.id).toBe('133300')
    expect(normalizeHit({ prod_mid: 19252, name: '東京迪士尼' })!.id).toBe('19252')
  })

  it('NaN / null / undefined 都不算有效 id', () => {
    expect(normalizeHit({ prod_oid: Number.NaN, name: 'x' })).toBeNull()
    expect(normalizeHit({ prod_oid: null, prod_mid: undefined, name: 'x' })).toBeNull()
  })
})

describe('searchProducts — 分頁', () => {
  it('每頁用 count=20（不是 UI 的 10），並帶上已驗證過的 sort=prec', async () => {
    mockApi([[apiItem()]])
    await searchProducts({ keyword: '東京' })
    const url = new URL(calls[0], 'https://www.kkday.com')
    expect(url.pathname).toBe('/zh-tw/product/ajax_get_product_list')
    expect(url.searchParams.get('count')).toBe('20')
    expect(url.searchParams.get('sort')).toBe('prec')
    expect(url.searchParams.get('keyword')).toBe('東京')
  })

  it('回傳不足一頁就停，不再多打', async () => {
    mockApi([[apiItem(), apiItem({ prod_oid: '2' })]])
    const r = await searchProducts({ keyword: '東京' })
    expect(calls).toHaveLength(1)
    expect(r.scanned).toBe(2)
    expect(r.truncated).toBe(false)
  })

  it('滿頁就續抓，抓到預設上限為止並標記 truncated', async () => {
    mockApi([fullPage(), fullPage(), fullPage(), fullPage()])
    const r = await searchProducts({ keyword: '東京' })
    expect(calls).toHaveLength(DEFAULT_MAX_PAGES)
    expect(r.scanned).toBe(PAGE_SIZE * DEFAULT_MAX_PAGES)
    expect(r.truncated).toBe(true)
    expect(r.notes.some((n) => /前段樣本|不是完整清單/.test(n))).toBe(true)
  })

  it('maxPages 有硬上限，agent 傳大數字也不能把瀏覽器拿去掃全站', async () => {
    mockApi(Array.from({ length: 50 }, () => fullPage()))
    await searchProducts({ keyword: '東京', maxPages: 999 })
    expect(calls).toHaveLength(HARD_MAX_PAGES)
  })

  it('HTTP 錯誤與格式不符都變成可讀錯誤，不是靜默空結果', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 }) as unknown as Response))
    await expect(searchProducts({ keyword: '東京' })).rejects.toThrow('HTTP 429')

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ msg: '參數錯誤' }) }) as unknown as Response))
    await expect(searchProducts({ keyword: '東京' })).rejects.toThrow('參數錯誤')
  })

  // code review 抓到的 Important：原本整個迴圈沒有 catch，第 2 頁失敗會讓整支 throw，
  // 第 1 頁已經拿到的 20 筆一起丟掉。而站方限流是實測過的行為（回 200 + 非預期格式）。
  it('第 2 頁失敗時保留第 1 頁的結果，並標註範圍不完整', async () => {
    let page = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        page += 1
        if (page === 1) {
          return {
            ok: true,
            json: async () => ({ data: { data: fullPage(), total: 590 } }),
          } as unknown as Response
        }
        return { ok: false, status: 429 } as unknown as Response
      }),
    )
    const r = await searchProducts({ keyword: '東京' })
    expect(r.scanned).toBe(PAGE_SIZE) // 第 1 頁沒有被丟掉
    expect(r.truncated).toBe(true)
    expect(r.notes.some((n) => n.includes('第 2 頁抓取失敗'))).toBe(true)
  })

  it('API 回空陣列時，明講「不是條件太嚴」並附上診斷', async () => {
    // scanned:0 與 matched:0 是完全不同的失敗。混在一起的代價實測過：
    // agent 以為條件太嚴、放寬重試還是 0，最後放棄 tool 改去爬 DOM。
    mockApi([[]])
    const r = await searchProducts({ keyword: '東京' })
    expect(r.scanned).toBe(0)
    expect(r.fetchDiagnostic).toContain('陣列長度 0')
    expect(r.notes[0]).toContain('不是條件太嚴')
    expect(r.notes[0]).toContain('舊版擴充套件')
  })

  it('有掃到但篩掉全部時，不會誤報成 API 失敗', async () => {
    mockApi([[apiItem({ rating_star: 3.0 })]])
    const r = await searchProducts({ keyword: '東京', minRating: 4.5 })
    expect(r.scanned).toBe(1)
    expect(r.matched).toBe(0)
    expect(r.fetchDiagnostic).toBeUndefined()
    expect(r.notes.some((n) => n.includes('不是條件太嚴'))).toBe(false)
  })

  it('回傳格式不符時，錯誤訊息帶上實際看到的 key（改版時唯一線索）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ data: { unexpected: 1, shape: 2 } }) }) as unknown as Response),
    )
    await expect(searchProducts({ keyword: '東京' })).rejects.toThrow('unexpected,shape')
  })

  it('讀得到 API 的 total，並在截斷時把真實比例講出來', async () => {
    mockApi([fullPage(), fullPage(), fullPage()], 590)
    const r = await searchProducts({ keyword: '東京' })
    expect(r.total).toBe(590)
    expect(r.notes.some((n) => n.includes('590 個商品') && n.includes('前段樣本'))).toBe(true)
  })

  it('萬一哪天 API 改成扁平 data[]，退路仍然讀得到（不要一改版就整支死掉）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ data: [apiItem()] }) }) as unknown as Response),
    )
    const r = await searchProducts({ keyword: '東京' })
    expect(r.scanned).toBe(1)
    expect(r.total).toBeUndefined()
  })
})

describe('searchProducts — client 端收斂（SRP UI 做不到的部分）', () => {
  it('minRating：篩掉低於門檻與沒有評分的商品', async () => {
    mockApi([[apiItem({ prod_oid: 'a', rating_star: 4.8 }), apiItem({ prod_oid: 'b', rating_star: 4.1 }), apiItem({ prod_oid: 'c', rating_star: null })]])
    const r = await searchProducts({ keyword: '東京', minRating: 4.5 })
    expect(r.hits.map((h) => h.id)).toEqual(['a'])
    expect(r.notes.some((n) => n.includes('沒有評分'))).toBe(true)
  })

  it('價格與日期都不是 filter —— 這是探索工具，不是篩選器集合', async () => {
    // maxPrice 比對的是起價（票券受日期影響、esim 受方案跨度影響）；
    // availableFrom 只是最早開賣日（esim 全部都是今天，等於沒篩）。兩個都移除，
    // 改成把 priceFrom/priceTo/earliestDate 完整交出去讓模型自己判斷。
    mockApi([[
      apiItem({ prod_oid: 'pricey', min_price: 9999, max_price: 20000 }),
      apiItem({ prod_oid: 'future', earliest_sale_date: '20271231' }),
    ]])
    const r = await searchProducts({ keyword: '東京' })
    expect(r.matched).toBe(2) // 兩筆都留著，資訊交給模型
    expect(r.hits.map((h) => h.priceFrom)).toContain(9999)
    expect(r.hits.map((h) => h.earliestDate)).toContain('2027-12-31')
  })

  it('起價警告無條件出現（不依賴任何參數）', async () => {
    mockApi([[apiItem()]])
    const r = await searchProducts({ keyword: '東京' })
    expect(r.notes.some((n) => n.includes('起價') && n.includes('不要據此斷言預算'))).toBe(true)
  })

  it('欄位叫 priceFrom 而不是 price（命名本身就是警告）', async () => {
    mockApi([[apiItem({ min_price: 1755 })]])
    const hit = (await searchProducts({ keyword: '東京' })).hits[0]
    expect(hit.priceFrom).toBe(1755)
    expect('price' in hit).toBe(false)
  })

  it('價格區間很寬時主動點出來（實測日本 eSIM 是 16–1841，115 倍）', async () => {
    mockApi([[apiItem({ min_price: 16, max_price: 1841 })]])
    const r = await searchProducts({ keyword: '日本esim' })
    expect(r.hits[0].priceTo).toBe(1841)
    expect(r.notes.some((n) => n.includes('價格區間很寬') && n.includes('16–1841'))).toBe(true)
  })

  it('沒有區間（min === max）時省略 priceTo，不製造假訊號', async () => {
    mockApi([[apiItem({ min_price: 533, max_price: 533 })]])
    const hit = (await searchProducts({ keyword: '東京' })).hits[0]
    expect(hit.priceTo).toBeUndefined()
  })

  it('earliestDate 照給但不當 filter，並附上「不代表那天有位」的警告', async () => {
    mockApi([[apiItem({ earliest_sale_date: '20260920' })]])
    const r = await searchProducts({ keyword: '東京' })
    expect(r.matched).toBe(1) // 沒有被日期排除
    expect(r.hits[0].earliestDate).toBe('2026-09-20')
    expect(r.notes.some((n) => n.includes('必須開該商品頁看日曆'))).toBe(true)
  })

  it('discount 是數字 0.5 → 轉成 50；髒值（-88）直接丟掉不轉述', async () => {
    mockApi([[apiItem({ prod_oid: 'ok', discount: 0.5 }), apiItem({ prod_oid: 'dirty', discount: -88 })]])
    const hits = (await searchProducts({ keyword: 'k' })).hits
    expect(hits.find((h) => h.id === 'ok')!.discountPct).toBe(50)
    expect(hits.find((h) => h.id === 'dirty')!.discountPct).toBeUndefined()
  })

  it('minReviews 擋掉小樣本高分商品（8 則評價的 5.0 星不該贏 5,044 則的 4.89 星）', async () => {
    mockApi([[
      apiItem({ prod_oid: 'tiny', rating_star: 5.0, rating_count: 8 }),
      apiItem({ prod_oid: 'solid', rating_star: 4.89, rating_count: 5044 }),
    ]])
    const r = await searchProducts({ keyword: '東京', minRating: 4.5, minReviews: 100, sort: 'rating' })
    expect(r.hits.map((h) => h.id)).toEqual(['solid'])
  })

  it('沒設 minReviews 時會提醒小樣本會洗榜', async () => {
    mockApi([[apiItem()]])
    const r = await searchProducts({ keyword: '東京', minRating: 4.5 })
    expect(r.notes.some((n) => n.includes('minReviews'))).toBe(true)
  })

  it('沒有 category 參數 —— product_category 是 CATEGORY_00x 代碼，比不中只會回假 0 筆', () => {
    // 型別層面就不該有這個參數。這條測試是防止有人「順手加回來」。
    const q: Record<string, unknown> = { keyword: '東京' }
    expect('category' in q).toBe(false)
  })

  it('兩個條件是 AND', async () => {
    mockApi([[
      apiItem({ prod_oid: 'hit', rating_star: 4.9, rating_count: 5000 }),
      apiItem({ prod_oid: 'tooFewReviews', rating_star: 4.9, rating_count: 8 }),
      apiItem({ prod_oid: 'lowRated', rating_star: 3.9, rating_count: 5000 }),
    ]])
    const r = await searchProducts({ keyword: '東京', minRating: 4.5, minReviews: 100 })
    expect(r.hits.map((h) => h.id)).toEqual(['hit'])
  })

  it('沒有條件時完全不篩，順序沿用 API 的推薦排序', async () => {
    mockApi([[apiItem({ prod_oid: 'x', rating_star: 4.0 }), apiItem({ prod_oid: 'y', rating_star: 4.9 })]])
    const r = await searchProducts({ keyword: '東京' })
    expect(r.hits.map((h) => h.id)).toEqual(['x', 'y'])
  })
})

describe('searchProducts — 排序與筆數', () => {
  it('rating / price_low / most_ordered 在 client 端排（不猜沒驗證過的 API enum）', async () => {
    const items = [
      apiItem({ prod_oid: 'mid', rating_star: 4.5, min_price: 2000, show_order_count: '50' }),
      apiItem({ prod_oid: 'top', rating_star: 4.9, min_price: 3000, show_order_count: '10' }),
      apiItem({ prod_oid: 'cheap', rating_star: 4.0, min_price: 500, show_order_count: '900' }),
    ]
    mockApi([items])
    expect((await searchProducts({ keyword: 'k', sort: 'rating' })).hits.map((h) => h.id)).toEqual(['top', 'mid', 'cheap'])
    mockApi([items])
    expect((await searchProducts({ keyword: 'k', sort: 'price_low' })).hits.map((h) => h.id)).toEqual(['cheap', 'mid', 'top'])
    mockApi([items])
    expect((await searchProducts({ keyword: 'k', sort: 'most_ordered' })).hits.map((h) => h.id)).toEqual(['cheap', 'mid', 'top'])
    // 所有排序都只呼叫同一個已驗證的 sort=prec
    expect(new Set(calls.map((c) => new URL(c, 'https://www.kkday.com').searchParams.get('sort')))).toEqual(new Set(['prec']))
  })

  // code review 抓到的 Minor：`(a ?? Infinity) - (b ?? Infinity)` 在兩邊都沒有價格時
  // 回 NaN，而 comparator 回 NaN 的排序結果在規格上是 implementation-defined。
  it('price_low 遇到整批都沒有價格時不會產生 NaN comparator', async () => {
    const items = [
      apiItem({ prod_oid: 'a', min_price: undefined, max_price: undefined }),
      apiItem({ prod_oid: 'b', min_price: undefined, max_price: undefined }),
      apiItem({ prod_oid: 'c', min_price: 500 }),
    ]
    mockApi([items])
    const hits = (await searchProducts({ keyword: 'k', sort: 'price_low' })).hits
    expect(hits[0].id).toBe('c') // 有價格的排最前
    expect(hits.map((h) => h.id).sort()).toEqual(['a', 'b', 'c']) // 沒有任何一筆消失
  })

  // 迴歸測試：把「API 沒回資料」與「回了但解析全失敗」講成同一句話，
  // 會讓看的人放棄工具改去爬 DOM。兩者訊息必須不同。
  it('回了資料但全部解析失敗時，錯誤訊息要指向解析層而不是 API 層', async () => {
    // 有 name 沒 id → normalize 全丟
    mockApi([[{ name: '無 id 商品' }, { name: '另一筆' }]])
    const r = await searchProducts({ keyword: '東京' })
    expect(r.scanned).toBe(0)
    expect(r.notes[0]).toContain('每一筆都無法解析')
    expect(r.notes[0]).not.toContain('一筆商品都沒回')
  })

  it('API 真的回空陣列時，訊息要指向 API 層', async () => {
    mockApi([[]])
    const r = await searchProducts({ keyword: '東京' })
    expect(r.scanned).toBe(0)
    expect(r.notes[0]).toContain('一筆商品都沒回')
  })

  // 迴歸測試：show_order_count 是縮寫字串。之前用 num() 讀，'300K+' 變成 300，
  // 於是 300K+ 訂單被排在 900 訂單後面 —— 排序看起來正常，實際完全反了。
  it('most_ordered 要看得懂 300K+ / 5K+ 這種縮寫，不能只讀前面的數字', async () => {
    const items = [
      apiItem({ prod_oid: 'nine-hundred', show_order_count: '900' }),
      apiItem({ prod_oid: 'three-hundred-k', show_order_count: '300K+' }),
      apiItem({ prod_oid: 'five-k', show_order_count: '5K+' }),
      apiItem({ prod_oid: 'one-m', show_order_count: '1.2M+' }),
    ]
    mockApi([items])
    const r = await searchProducts({ keyword: 'k', sort: 'most_ordered' })
    expect(r.hits.map((h) => h.id)).toEqual(['one-m', 'three-hundred-k', 'five-k', 'nine-hundred'])
  })

  it('limit 只切最終輸出，matched 仍回報真實命中數', async () => {
    mockApi([fullPage(), []])
    const r = await searchProducts({ keyword: '東京', limit: 3 })
    expect(r.hits).toHaveLength(3)
    expect(r.matched).toBe(PAGE_SIZE)
  })

  it('limit 有上下界，超界會被夾住', async () => {
    mockApi([fullPage(), []])
    expect((await searchProducts({ keyword: 'k', limit: 999 })).hits).toHaveLength(20)
    mockApi([fullPage(), []])
    expect((await searchProducts({ keyword: 'k', limit: 0 })).hits).toHaveLength(1)
  })
})
