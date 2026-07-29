// KKday 商品搜尋 —— discovery tool 的資料層。
//
// 定位：**這是探索工具，不是篩選器集合。**
//
// 使用者真正的痛點不是「怎麼下單」，是「怎麼在 590 個東京商品裡找到適合自己的」。而 SRP
// 一頁只給 10 筆（590 筆 = 59 頁，分頁按鈕還沒有 href），篩選器只有 6 組。
//
// 但「把缺的篩選器補回來」是錯的解法。實機驗證下來，五個候選 filter 只有兩個站得住：
//
// | filter | 結論 |
// | --- | --- |
// | `minRating` | ✅ `rating_star` 乾淨可用 |
// | `minReviews` | ✅ `rating_count` 乾淨可用，且能擋掉小樣本高分商品洗榜 |
// | `maxPrice` | ❌ 已移除。比對的是起價，見下方 |
// | `availableFrom` | ❌ 已移除。只是「最早開賣日」，esim 類全部都是今天，等於沒篩 |
// | `category` | ❌ 已移除。`product_category` 是 `{main:'CATEGORY_002'}` 不透明代碼，比不中只會回**假 0 筆** |
//
// 所以這一層的職責改成：**把欄位完整、誠實地交出去，讓模型自己判斷**——包括判斷
// 「這個價格區間太寬，我不該替使用者斷言預算夠不夠」。少給假的精確度，比多給一個
// 用不住的 filter 有價值。
//
// ── 為什麼價格不能拿來篩（實測 2026-07-28）─────────────────────────────
// `min_price` 是「起價」，而它不精確的原因**依品類不同**：
//
//   • 票券 / 行程：**日期造成的**。東京迪士尼起價 1,755，8/15 當天 2,150（旺季加價）；
//     teamLab 710 → 868；晴空塔 434 → 631。
//   • eSIM / 通訊：**方案跨度造成的**。日本 eSIM 的 min 16 / max 1,841 —— 115 倍差距，
//     那是「1 天小流量」到「30 天無限」的跨度。「NT$16 起」對預算判斷毫無參考價值。
//
// 兩種都會讓「起價 ≤ 2000」變成一個看起來精確、實際誤導的條件。實測有 agent 據此推薦
// 「2,000 內組合」，實際加起來 2,051，還推了一個當天根本訂不到的商品。
//
// 所以改成同時回 `priceFrom` 與 `priceTo` —— 兩者差很多本身就是訊號，模型看得懂
// 「這要看你選哪個方案 / 哪一天」。
//
// ── API 現況（實機驗證）───────────────────────────────────────────────
// `GET /zh-tw/product/ajax_get_product_list`，吃 keyword / currency / sort / page / start /
// count / tab_key（`tab_key=` 空字串與不帶完全等價，實測 569 vs 569）。
//
// 回傳是**巢狀**的：`{ data: { data: [...], total, total_page, saleable_product_count } }`。
// 商品陣列在 `data.data`，外層 `data` 是 metadata 容器。
//
// 已知的髒資料：`official_price` 不可信（實測 KDDI eSIM 的 min=178 但 official=2、
// discount=-88），所以不轉述原價。`readable_url` 有時是空字串（20 筆裡 2 筆）。

const ENDPOINT = '/zh-tw/product/ajax_get_product_list'

/** 每頁筆數。UI 是 10；20 是在「少一點往返」與「不踩不明上限」之間取的保守值。 */
export const PAGE_SIZE = 20
/** 預設最多抓幾頁（20 × 3 = 60 筆候選）。刻意小：這是 progressive enhancement，不是爬蟲。 */
export const DEFAULT_MAX_PAGES = 3
/** 硬上限，避免 agent 傳個大數字就把使用者的瀏覽器拿去掃全站 */
export const HARD_MAX_PAGES = 5
/** 預設回傳筆數。欄位完整優先於筆數多 —— 見 webmcpTools 的 1500 字元預算 */
export const DEFAULT_LIMIT = 12
const PAGE_DELAY_MS = 250
/** priceTo / priceFrom 超過這個倍數就在 notes 裡點出來 */
const WIDE_SPAN_RATIO = 1.5

export type SortId = 'recommended' | 'rating' | 'price_low' | 'most_ordered'

export interface SearchQuery {
  /** 關鍵字（城市、景點、商品名都可） */
  keyword: string
  /** 最低星等，例 4.5 */
  minRating?: number
  /** 最低評論數。防止 8 則評價的 5.0 星洗掉 5,044 則的 4.89 星 */
  minReviews?: number
  sort?: SortId
  /** 最終回傳幾筆 */
  limit?: number
  maxPages?: number
}

export interface SearchHit {
  id: string
  name: string
  /** 商品頁 slug。API 有時回空字串（實測 20 筆裡 2 筆），空的就省略不給 */
  url?: string
  rating?: number
  ratingCount?: number
  ordered?: string
  currency?: string
  /** 起價（`min_price`）＝全期間、全方案的最低價。**不是特定日期 / 特定方案的價格** */
  priceFrom?: number
  /** 最高價（`max_price`）。與 priceFrom 差距很大就代表「價格取決於你選什麼」 */
  priceTo?: number
  /** 折扣百分比。只在 API 回的值合理（0–100%）時才給 —— 實測有 -88 這種髒資料 */
  discountPct?: number
  earliestDate?: string
  /** 服務標籤，例「立即確認」「1天前可免費取消」。**不含品類詞** */
  tags?: string[]
}

export interface PageResult {
  items: Record<string, unknown>[]
  /** 診斷用：這次請求的 HTTP 狀態與回傳形狀，出問題時要能一眼看出是哪一層壞了 */
  diagnostic: string
  /** 這個關鍵字的商品總數（實測 keyword=東京 → 590、日本esim → 569） */
  total?: number
  totalPage?: number
}

export interface SearchResult {
  query: SearchQuery
  /** 這個關鍵字在 KKday 上的商品總數 */
  total?: number
  /** 實際掃過幾筆候選 */
  scanned: number
  /** 通過篩選的筆數（僅就掃過的範圍而言） */
  matched: number
  /** 是否還有沒掃到的商品（掃到上限就停） */
  truncated: boolean
  hits: SearchHit[]
  notes: string[]
  /**
   * `scanned === 0` 時填。
   *
   * ⚠️ 為什麼需要這個：`scanned: 0` 與 `matched: 0` 是**完全不同的兩種失敗**——前者是 API 沒
   * 回東西（endpoint 改了、被限流、或跑的是舊版 build），後者是條件太嚴。實測有人拿到
   * `scanned: 0` 卻只看到「沒有符合條件的商品」，完全無從判斷是哪一種，只好放棄 tool 改去爬
   * DOM。錯誤訊息含糊的代價就是這個。
   */
  fetchDiagnostic?: string
}

/**
 * 數字正規化。字串路徑要留住負號 —— `[^\d.]` 會把 `-` 一起吃掉，讓 `'-88'` 變成 `88`，
 * 於是髒資料從「明顯錯誤的負值」變成「看起來正常的正值」。這比直接壞掉更難發現。
 */
function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.-]/g, ''))
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/**
 * 識別碼正規化。
 *
 * ⚠️ 實機踩到的坑（2026-07-29）：`prod_oid` / `prod_mid` 在真 API 回的是**數字**
 * （`133300`），但 test fixture 寫成字串（`'12319'`）。`str()` 只收 string，於是
 * `normalizeHit` 對每一筆都回 null → `scanned: 0` → 工具回報「API 一筆都沒回」，
 * 而診斷字串同時說 `data.data 陣列長度 20`。兩句話互相矛盾，因為壞的不是 fetch 是
 * normalize。fixture 與實機型別不一致的代價就是這個：測試全綠、線上全掛。
 *
 * 所以 id 一律走這支，number 與 string 都收。
 */
function id(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return str(v)
}

/**
 * `show_order_count` 是**給人看的縮寫字串**，實機看到 `"300K+"`、`"5K+"`、`"900"`。
 *
 * ⚠️ 直接丟給 `num()` 會把 `"300K+"` 讀成 `300`，於是 `most_ordered` 排序把
 * 「300K+ 訂單」排在「900 訂單」後面 —— 排序看起來正常，實際完全反了。K/M 要展開。
 */
function orderCount(v: unknown): number | undefined {
  const s = str(v)
  if (!s) return num(v)
  const m = s.match(/^([\d.,]+)\s*([KkMm])?/)
  if (!m) return undefined
  const base = Number(m[1].replace(/,/g, ''))
  if (!Number.isFinite(base)) return undefined
  const mult = m[2] ? (m[2].toUpperCase() === 'M' ? 1_000_000 : 1_000) : 1
  return base * mult
}

/**
 * 日期正規化成 `YYYY-MM-DD`。
 *
 * ⚠️ 實機踩到的坑：API 的 `earliest_sale_date` 是**緊湊格式** `20260729`。直接拿它跟
 * `YYYY-MM-DD` 做字串比較，`'20260729' > '2026-08-15'` 恆為 true（第 5 個字元 `'0'` 的碼位
 * 大於 `'-'`），會讓日期條件把每一筆都排除、**命中永遠 0 而且不報錯**。兩種格式都收。
 */
function isoDate(v: unknown): string | undefined {
  const s = str(v)
  if (!s) return undefined
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : undefined
}

/** `discount` 實測是數字（0.5 = 五折），但也出現過 -88 這種髒值 → 只接受 0–1 之間 */
function discountPct(v: unknown): number | undefined {
  const d = num(v)
  if (d == null || d <= 0 || d >= 1) return undefined
  return Math.round(d * 100)
}

// display_tags 的元素可能是字串也可能是物件，兩種都收
function names(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => (typeof x === 'string' ? x : str((x as Record<string, unknown>)?.name)))
    .filter((x): x is string => !!x)
}

/** 把 API 的單筆商品正規化。欄位名對齊實機觀察到的 response。 */
export function normalizeHit(raw: Record<string, unknown>): SearchHit | null {
  const oid = id(raw.prod_oid) ?? id(raw.prod_mid)
  const name = str(raw.name)
  if (!oid || !name) return null
  const priceFrom = num(raw.min_price)
  const priceTo = num(raw.max_price)
  return {
    id: oid,
    name,
    url: str(raw.readable_url),
    rating: num(raw.rating_star),
    ratingCount: num(raw.rating_count),
    ordered: str(raw.show_order_count),
    currency: str(raw.currency),
    priceFrom,
    // priceTo 等於 priceFrom 時省略：沒有區間就沒有「取決於方案」這個訊號要傳達
    priceTo: priceTo != null && priceFrom != null && priceTo > priceFrom ? priceTo : undefined,
    discountPct: discountPct(raw.discount),
    earliestDate: isoDate(raw.earliest_sale_date),
    tags: names(raw.display_tags),
  }
}

function pageUrl(keyword: string, page: number): string {
  const url = new URL(ENDPOINT, location.origin)
  url.searchParams.set('keyword', keyword)
  url.searchParams.set('currency', 'TWD')
  // 只用實機確認過的 sort 值。其餘排序在 client 端做 —— 不猜沒驗證過的 enum，
  // 猜錯會安靜地回一份「排序看起來很正常、但其實是預設順序」的結果。
  url.searchParams.set('sort', 'prec')
  url.searchParams.set('page', String(page))
  url.searchParams.set('count', String(PAGE_SIZE))
  return url.toString()
}

/** 抓一頁。商品陣列在 `data.data`，退路支援萬一改成扁平 `data[]`。 */
export async function fetchPage(keyword: string, page: number): Promise<PageResult> {
  const res = await fetch(pageUrl(keyword, page), {
    headers: { accept: 'application/json' },
    credentials: 'same-origin',
  })
  if (!res.ok) throw new Error(`搜尋 API 回 HTTP ${res.status}`)
  const body = (await res.json()) as { data?: unknown; msg?: string }
  const outer = body?.data as Record<string, unknown> | undefined
  const nested = Array.isArray(outer?.data)
  const flat = Array.isArray(body?.data)
  const items = nested ? (outer!.data as unknown[]) : flat ? (body.data as unknown[]) : null
  if (!items) {
    // 形狀不符時把實際看到的 key 講出來 —— 這支是前端 BFF，改版時這個訊息就是唯一線索
    const keys = outer && typeof outer === 'object' ? Object.keys(outer).slice(0, 8).join(',') : typeof outer
    throw new Error(
      `搜尋 API 回傳格式不符預期（data 不是陣列，實際看到的 key: ${keys}）${body?.msg ? `｜msg: ${body.msg}` : ''}`,
    )
  }
  return {
    items: items as Record<string, unknown>[],
    total: num(outer?.total) ?? num(outer?.saleable_product_count),
    totalPage: num(outer?.total_page),
    diagnostic: `HTTP ${res.status}｜${nested ? 'data.data' : 'data'} 陣列長度 ${items.length}`,
  }
}

// ── client 端收斂 ─────────────────────────────────────────
// 只做「篩選與排序」，不做「計算」—— 數字全部原樣沿用 API 回的值，不加總也不換算。
// 而且只保留評分與評論數這兩個站得住的維度（理由見檔頭）。

function matches(hit: SearchHit, q: SearchQuery): boolean {
  if (q.minRating != null && !(hit.rating != null && hit.rating >= q.minRating)) return false
  if (q.minReviews != null && !(hit.ratingCount != null && hit.ratingCount >= q.minReviews)) return false
  return true
}

/** 沒有值的一律排到最後，且兩邊都沒有時回 0 —— comparator 回 NaN 的排序結果未定義 */
function byAsc(a: number | undefined, b: number | undefined): number {
  const av = a ?? Infinity
  const bv = b ?? Infinity
  return av === bv ? 0 : av - bv
}

function sortHits(hits: SearchHit[], sort: SortId): SearchHit[] {
  const out = [...hits]
  if (sort === 'rating') out.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
  else if (sort === 'price_low') out.sort((a, b) => byAsc(a.priceFrom, b.priceFrom))
  else if (sort === 'most_ordered') out.sort((a, b) => (orderCount(b.ordered) ?? 0) - (orderCount(a.ordered) ?? 0))
  return out // 'recommended' = 沿用 API 順序
}

/**
 * 搜尋並回傳候選集。
 *
 * 多抓幾頁當候選（SRP 一頁只有 10 筆），套用評分 / 評論數門檻，其餘欄位完整交給模型判斷。
 */
export async function searchProducts(q: SearchQuery): Promise<SearchResult> {
  const notes: string[] = []
  const limit = Math.min(Math.max(q.limit ?? DEFAULT_LIMIT, 1), 20)
  const maxPages = Math.min(Math.max(q.maxPages ?? DEFAULT_MAX_PAGES, 1), HARD_MAX_PAGES)

  const raw: Record<string, unknown>[] = []
  const diagnostics: string[] = []
  let truncated = false
  let total: number | undefined
  // 逐頁 catch：第 2 頁失敗不該把第 1 頁已經拿到的結果一起丟掉。
  // 這不是假想情境 —— 站方的限流是實測過的行為，而且它回的是 HTTP 200 + 非預期格式，
  // 也就是會走到 fetchPage 的 throw。一次搜尋預設要打 3 頁，中途掛掉是預期會發生的。
  for (let page = 1; page <= maxPages; page += 1) {
    let items: Record<string, unknown>[]
    try {
      const r = await fetchPage(q.keyword, page)
      items = r.items
      if (page === 1) total = r.total
      diagnostics.push(`p${page}: ${r.diagnostic}`)
    } catch (err) {
      // 第 1 頁就失敗 = 完全取不到資料，維持 throw：呼叫端要能區分「取不到」與「取到但沒符合的」。
      if (page === 1) throw err
      // 第 2 頁之後失敗 → 保留已經拿到的頁，誠實標註範圍不完整
      diagnostics.push(`p${page}: 失敗（${(err as Error).message}）`)
      notes.push(`第 ${page} 頁抓取失敗，以下結果只涵蓋前 ${page - 1} 頁的候選，不是完整範圍。`)
      truncated = true
      break
    }
    raw.push(...items)
    if (items.length < PAGE_SIZE) break // 不足一頁 = 到底了
    if (page === maxPages) truncated = true
    if (page < maxPages) await new Promise((r) => setTimeout(r, PAGE_DELAY_MS))
  }

  const all = raw.map(normalizeHit).filter((h): h is SearchHit => h !== null)
  const kept = all.filter((h) => matches(h, q))
  const hits = sortHits(kept, q.sort ?? 'recommended').slice(0, limit)

  // ── 誠實標註 ────────────────────────────────────────────
  // 這幾條 note 存在的理由都是實測抓到的過度斷言：agent 會拿起價當當天價、
  // 拿樣本當全貌、拿小樣本高分當推薦。

  // 起價警告無條件加。實測有 agent 把起價 710 當成 8/15 的價格（實際 868），
  // 給出的「2,000 內組合」加起來是 2,051。
  notes.push(
    'priceFrom 是「起價」（全期間、全方案最低價），不是特定日期或特定方案的價格。旺季與週末經常更高（實測有商品從 1,755 變成 2,150）。回答時要說這是「起價」，不要據此斷言預算夠不夠。',
  )

  const wide = hits.filter((h) => h.priceTo != null && h.priceFrom != null && h.priceTo / h.priceFrom > WIDE_SPAN_RATIO)
  if (wide.length) {
    const worst = wide.reduce((a, b) => (b.priceTo! / b.priceFrom! > a.priceTo! / a.priceFrom! ? b : a))
    notes.push(
      `其中 ${wide.length} 筆的價格區間很寬（最寬的是 ${worst.priceFrom}–${worst.priceTo}），代表價格取決於使用者選哪個方案／天數，起價幾乎沒有預算參考價值。這類商品要請使用者自己看方案。`,
    )
  }

  if (truncated) {
    notes.push(
      total != null
        ? `這個關鍵字共有 ${total} 個商品，只掃了照推薦排序的前 ${all.length} 筆（每頁 ${PAGE_SIZE} × ${maxPages} 頁上限）。符合條件的商品幾乎一定還有，回答時要說明這是前段樣本。`
        : `只掃了前 ${all.length} 筆候選就停。符合條件的商品可能還有，這不是完整清單。`,
    )
  }
  if (q.minRating != null && all.some((h) => h.rating == null)) {
    notes.push('部分商品沒有評分（新上架或評論不足），已被評分條件排除。')
  }
  if (q.minRating != null && q.minReviews == null) {
    notes.push('沒有設 minReviews：依評分排序時，評論數很少的商品（例如 8 則評價的 5.0 星）可能排在評論數上千的前面。')
  }
  if (hits.some((h) => h.earliestDate)) {
    notes.push('earliestDate 是「最早可出發／開賣日」，不代表使用者想去的那天有位。要確認特定日期，必須開該商品頁看日曆。')
  }

  // ── scanned 0 的三種成因要分開講 ────────────────────────
  //
  // ⚠️ 這段原本只有一句「API 一筆商品都沒回」，但診斷字串同時印著「data.data 陣列長度 20」。
  // 兩句互相矛盾，看的人（人或 agent）只能放棄工具改去爬 DOM —— 實測就這樣浪費了一輪。
  // 成因其實有三種，而修法完全不同：
  //
  //   1. fetch 就沒拿到東西      → endpoint 改版 / 被限流
  //   2. fetch 有拿到但 normalize 全丟 → 欄位名或**型別**變了（prod_oid 由 string 變 number）
  //   3. normalize 有過但條件全篩掉  → 條件太嚴（這種 all.length > 0，不會進這裡）
  //
  // 第 2 種是最會被誤判成第 1 種的。它有個明確特徵：rawCount > 0 而 all.length === 0。
  if (!all.length) {
    const rawCount = raw.length
    notes.unshift(
      rawCount > 0
        ? `⚠️ 搜尋 API 有回 ${rawCount} 筆原始資料，但**每一筆都無法解析**（缺 id 或 name）。` +
            `這不是條件太嚴，也不是 API 掛了 —— 是回傳的欄位名或型別跟解析器對不上（例如 prod_oid ` +
            `由字串變成數字）。診斷：${diagnostics.join('；')}。請回報這個錯誤，放寬條件重試不會有幫助。`
        : `⚠️ 搜尋 API 一筆商品都沒回（不是條件太嚴）。診斷：${diagnostics.join('；')}。` +
            `可能是 endpoint 改版、被限流，或跑的是舊版擴充套件（請重新 build）。`,
    )
  }

  return {
    query: q,
    total,
    scanned: all.length,
    matched: kept.length,
    truncated,
    hits,
    notes,
    ...(all.length ? {} : { fetchDiagnostic: diagnostics.join('；') }),
  }
}
