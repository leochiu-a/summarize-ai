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
// | `availableFrom` | ❌ 已移除。當時只能拿 `earliest_sale_date`（最早開賣日）在 client 端篩，esim 類全部都是今天，等於沒篩 |
// | `category` | ❌ 已移除。`product_category` 是 `{main:'CATEGORY_002'}` 不透明代碼，比不中只會回**假 0 筆** |
//
// 所以這一層的職責改成：**把欄位完整、誠實地交出去，讓模型自己判斷**——包括判斷
// 「這個價格區間太寬，我不該替使用者斷言預算夠不夠」。少給假的精確度，比多給一個
// 用不住的 filter 有價值。
//
// ── 例外：出發日期（`saleDateFrom` / `saleDateTo`，2026-08-03 實機驗證）─────────
// 上表的 `availableFrom` 是**用錯資料來源**才站不住，不是「日期不該篩」。SRP 側邊欄其實
// 有一個真的「出發日期」篩選器（`input[placeholder="出發日期"]`，daterangepicker），
// 它打的是**同一支 endpoint 的另一種形狀**，而且是後端篩的：
//
//   POST /zh-tw/product/ajax_get_product_list?keyword=…&sort=prec&page=1&count=20
//   Content-Type: application/x-www-form-urlencoded
//   X-Requested-With: XMLHttpRequest
//   body: filter[sale_date][from]=20261105&filter[sale_date][to]=20261120&csrf_token_name=<hash>
//
// （query 那半跟原本的 GET 完全一樣。SRP 還會多帶 `start` 與 `tab_key`，我們不帶 —— 見 `pageUrl`。）
//
// 實測 `keyword=東京`：無條件 594 → 11/05–11/20 剩 542（同一天內重測會在 ±3 筆間漂，
// 站上商品本來就一直在動，看的是量級不是精確值）。而且被篩掉的商品 `earliest_sale_date`
// 是 2026-08 —— 也就是**這件事 client 端用 earliest_sale_date 永遠做不到**。
// 這正好落在「WebMCP 省的是跨頁抓取與多步互動」那條判準的獲勝側。
//
// 三個實測踩到、會安靜出錯的地方（都在下面的程式碼裡擋住了）：
//
//   1. **`filter[…]` 只從 `$_POST` 讀，所以非 POST + form-urlencoded 不可。**
//      這條不是猜的，是 member-ci（CodeIgniter 2）的 controller 明寫的：
//      `application/controllers/product.php` 的 `ajax_get_product_list()` 第一件事是
//
//        $request_body_data = $this->input->post() ?: [];
//
//      CI2 的 `Input::post()` 只走 `$_POST`（`system/core/Input.php`），而 PHP 只在
//      **method 是 POST 且 Content-Type 是 form-urlencoded / multipart** 時才填 `$_POST`。
//      推論出兩件事，兩件都是實作上的硬約束、不是風格選擇：
//
//        • query string 放 filter 永遠沒用（controller 根本沒讀 `$_GET` 的 filter）
//        • **body 用 JSON 也沒用** —— `$_POST` 不會被填。Content-Type 必須是 form-urlencoded
//
//      實測四種組合，四種都回 HTTP 200、沒有任何錯誤訊號：
//
//        | 送法 | total |
//        | --- | --- |
//        | GET，filter 放 query | 594（無效） |
//        | **POST，filter 放 query** | **594（無效）** |
//        | POST，filter 放 body | 541 ✅ |
//        | POST，不帶 filter | 594（POST 本身不影響結果） |
//
//      所以「改成 POST 就好」是錯的直覺，會得到一份看起來正常、其實沒篩的結果。
//      URL 上那組 `sale_date_from` / `sale_date_to` 也只是**頁面網址**用的，API 不看。
//
//      題外話但值得記：member-ci 只是 BFF，它轉手打上游 search API 時**真的是 GET 帶 body**
//      （`CURLOPT_CUSTOMREQUEST => 'GET'` + `CURLOPT_POSTFIELDS => json_encode(body)`，見
//      `application/models/kk_web_api_model.php` 的 `get_with_body_and_query`）。
//      也就是「GET 讀 body」這個設計在這條鏈上確實存在，只是不在我們打的那一跳。
//   2. **日期必須是緊湊格式 `YYYYMMDD`**（前端共用的 `apiDateFormat`，見 member-ci 的
//      `resources/share/js/libs/dateTimeFormat.js`）。傳 `2026-11-05` 會回 HTTP 200 +
//      `status:"success"` + `total:0`，而且 `data` 陣列**被換成 `recommend_productlist`**
//      （搜「東京」回釜山通行證）。跟「這個區間真的沒有商品」（實測 2028-11 就是這樣）
//      回的是同一個形狀，事後無法區分 —— 所以格式在送出前就要驗死。
//      （member-ci 對 `filter` 是**原封不動轉發**，`PRODUCT_LIST_FILTER_ID_SALE_DATE` 只被
//      define 沒被用到 —— 也就是格式檢查在上游 search API，BFF 這層不會擋，也不會轉譯。）
//   3. **要帶 CSRF token**，不帶回 HTTP 403。token 在 SSR bootstrap 裡
//      （`__INIT_STATE__.state.security`），而**商品頁沒有 `__INIT_STATE__`**，
//      得另外抓一次列表頁 HTML（~1.5MB）才拿得到。見 `getCsrf`。
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
  /**
   * 出發日期區間起（`YYYY-MM-DD`）。**這是後端篩的**，不是 client 端拿
   * `earliest_sale_date` 比對——後者做不到（見檔頭）。兩端可以只給一邊。
   */
  saleDateFrom?: string
  /** 出發日期區間迄（`YYYY-MM-DD`） */
  saleDateTo?: string
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
  /** 實際送給後端的出發日期區間（`YYYY-MM-DD ~ YYYY-MM-DD`）。沒帶日期時不填 */
  dateWindow?: string
  /**
   * `scanned === 0` 時填，說明**是哪一種 0**。三種的修法完全不同：
   *
   *   • `fetch` —— API 一筆都沒回（endpoint 改版 / 被限流）。放寬條件沒用
   *   • `parse` —— 有回但每一筆都解析不了（欄位名或型別變了）。放寬條件沒用
   *   • `dateWindow` —— 後端的出發日期篩選回 0 筆。**這一種放寬日期是有用的**
   *
   * 混在一起講的代價實測過：agent 拿到 `scanned: 0` 以為是條件太嚴，放寬重試還是 0，
   * 最後放棄 tool 改去爬 DOM。
   */
  emptyReason?: 'fetch' | 'parse' | 'dateWindow'
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

// ── 出發日期篩選：CSRF token 與 POST 形狀 ─────────────────
//
// CSRF 不是日期參數要求的，是**跟著 POST 來的**（CodeIgniter 2 的 CSRF 只擋 POST；實測
// 「POST 但不帶 filter」一樣要 token，不帶就 403）。而我們之所以非 POST 不可，是因為
// controller 用 `$this->input->post()` 讀 filter —— 詳見檔頭第 1 點。
//
// ⚠️ 這一段是整支檔案裡唯一綁到站方前端內部細節的地方（`__INIT_STATE__` 的形狀）。
// AGENTS.md 的紅線是「不要綁 Vue 內部細節」，這裡破例的理由與代價要講清楚：
// 後端要 CSRF token，而 token 只存在於 SSR bootstrap 裡，沒有第二個來源。
// 補償做法是**壞掉時要大聲**——拿不到 token 就讓整支搜尋失敗（見 `searchProducts`），
// 絕不「安靜地回一份沒套用日期的結果」。後者才是真正危險的：agent 會把全年份的商品
// 當成「11 月可訂」講給使用者聽，而輸出上完全看不出來篩選沒生效。

interface Csrf {
  name: string
  hash: string
}

/** token 一個 page load 內不會變，抓一次就好（退路要抓 ~1.5MB 的 HTML） */
let csrfCache: Csrf | null = null

/** 測試用：token 是模組級狀態，`afterEach` 要清掉，否則下一個測試會沿用上一個的 stub */
export function resetCsrfCache(): void {
  csrfCache = null
}

/** 列表頁自己就有（`__INIT_STATE__.state.security`），不用多打一次網路 */
function csrfFromPage(): Csrf | null {
  const state = (window as unknown as {
    __INIT_STATE__?: { state?: { security?: { CSRFTokenName?: unknown; CSRFHash?: unknown } } }
  }).__INIT_STATE__
  const name = str(state?.state?.security?.CSRFTokenName)
  const hash = str(state?.state?.security?.CSRFHash)
  return name && hash ? { name, hash } : null
}

/**
 * 退路：抓一次列表頁 HTML 把 token 抽出來。
 *
 * ⚠️ **商品頁沒有 `__INIT_STATE__`**（實測 `/zh-tw/product/12319` 是 undefined），而
 * `search_products` 是全站註冊的，所以這條退路是必要的，不是防禦性程式碼。
 *
 * ⚠️ 同一份資料在兩個地方的 key 名不一樣：runtime 的 `__INIT_STATE__.state.security` 是
 * `CSRFHash`，SSR HTML 裡序列化出來的是 `member.csrf_hash`。兩個都要認。
 */
async function csrfFromSrpHtml(keyword: string): Promise<Csrf | null> {
  const url = new URL('/zh-tw/product/productlist', location.origin)
  url.searchParams.set('keyword', keyword)
  // 刻意不看 res.ok：搜不到結果的關鍵字回 404，但那份 HTML 裡的 token 一樣有效（實測）
  const html = await (await fetch(url.toString(), { credentials: 'same-origin' })).text()
  const hash = html.match(/"(?:csrf_hash|CSRFHash)"\s*:\s*"([a-f0-9]+)"/)?.[1]
  const name = html.match(/"(?:csrf_token_name|CSRFTokenName)"\s*:\s*"(csrf_[^"]+)"/)?.[1]
  return hash ? { name: name ?? 'csrf_token_name', hash } : null
}

async function getCsrf(keyword: string): Promise<Csrf | null> {
  if (!csrfCache) csrfCache = csrfFromPage() ?? (await csrfFromSrpHtml(keyword))
  return csrfCache
}

/** 送上線的緊湊格式。輸入一律是 `YYYY-MM-DD`，這裡只做轉換不做寬容解析 */
function compact(iso: string): string {
  return iso.replace(/-/g, '')
}

/**
 * 出發日期的驗證。有問題回**可自我修正的訊息**，沒問題回 null。
 *
 * 兩層 caller（tool 與 lib）共用同一份，訊息刻意不提參數名 —— tool 那邊叫 `dateFrom`、
 * lib 這邊叫 `saleDateFrom`，寫死任一個都會對另一個說錯話。
 *
 * ⚠️ **為什麼光有 `/^\d{4}-\d{2}-\d{2}$/` 不夠**（2026-08-03 實測）：格式對但日子不存在時，
 * 後端的反應**分兩種，而兩種都不會報錯**：
 *
 *   • `20261131`（11 月沒 31 號）→ 回 538 筆。後端自己滾到 12/1，也就是**回了另一個區間
 *     的答案**，而我們會照著它宣告「11/01–11/31 有 538 個選擇」
 *   • `20260230` / `20261301` → 回 `total: 0`
 *
 * 第二種特別貴：0 筆會走到 `emptyReason: 'dateWindow'`，於是我們對一個**根本不存在的日期**
 * 講出一句關於庫存的斷言（「這段期間沒有可訂商品，換日期是有意義的重試」）。
 * 所以日子存不存在必須自己驗 —— 用 Date 來回轉一次就夠，不值得為這件事加一個日期套件。
 */
export function validateDateWindow(from?: unknown, to?: unknown): string | null {
  for (const value of [from, to]) {
    if (value == null) continue
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return `"${String(value)}" is not a valid date. Use YYYY-MM-DD, e.g. "2026-11-01".`
    }
    // 來回轉一次：Date 對 2026-11-31 會滾成 12-01（對不回原字串），對 13 月回 NaN
    const parsed = new Date(`${value}T00:00:00Z`)
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      return `"${value}" is not a real calendar date. Check how many days that month has.`
    }
  }
  if (typeof from === 'string' && typeof to === 'string' && to < from) {
    return `The departure window is reversed: "${to}" is earlier than "${from}". Put the earlier date first.`
  }
  return null
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
  // 刻意**不**跟著 SRP 一起帶 `start` 與 `tab_key`。SRP 有帶，但兩個都是無效參數：
  //   • `start` 由後端自己算（`kkday_search_service.php`：`($page - 1) * $count`），不吃輸入
  //   • `tab_key` 預設就是空字串，而且 controller 讀的是 body 那份不是 query 這份
  // 實測補上/拿掉，page 1 與 page 2 的 total 與首筆 id 都完全一樣。帶了只是讓人以為它有用。
  return url.toString()
}

/** `fetchPage` 的日期篩選參數。`from` / `to` 已是 `YYYY-MM-DD`，呼叫端負責驗過格式 */
export interface DateFilter {
  from?: string
  to?: string
  csrf: Csrf
}

function filterBody({ from, to, csrf }: DateFilter): string {
  const body = new URLSearchParams()
  if (from) body.set('filter[sale_date][from]', compact(from))
  if (to) body.set('filter[sale_date][to]', compact(to))
  body.set(csrf.name, csrf.hash)
  return body.toString()
}

/** 抓一頁。商品陣列在 `data.data`，退路支援萬一改成扁平 `data[]`。 */
export async function fetchPage(keyword: string, page: number, filter?: DateFilter): Promise<PageResult> {
  const url = pageUrl(keyword, page)
  const res = filter
    ? await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          // Content-Type **必須**是 form-urlencoded：controller 讀的是 `$_POST`，而 PHP 只在
          // form-urlencoded / multipart 時才填它。改成 JSON 會安靜地變成「沒帶 filter」。
          // X-Requested-With 是照實機那一發帶的，沒實測過少了會怎樣，不省。
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          accept: 'application/json, text/plain, */*',
        },
        body: filterBody(filter),
      })
    : await fetch(url, { headers: { accept: 'application/json' }, credentials: 'same-origin' })
  if (!res.ok) throw new Error(`搜尋 API 回 HTTP ${res.status}`)
  const body = (await res.json()) as { data?: unknown; msg?: string }
  const outer = body?.data as Record<string, unknown> | undefined
  const nested = Array.isArray(outer?.data)
  const flat = Array.isArray(body?.data)
  const items = nested ? (outer!.data as unknown[]) : flat ? (body.data as unknown[]) : null
  const total = num(outer?.total) ?? num(outer?.saleable_product_count)
  if (!items) {
    // 「這個條件下沒有商品」不是格式錯誤 —— 站方回的是 HTTP 200 + status:"success" +
    // total:0，而且把 `data` 陣列換成 `recommend_productlist`（實測搜「東京」回釜山通行證）。
    // 硬 throw 成「格式不符預期」會把一個正常結果講成 API 掛了。
    if (total === 0) {
      return {
        items: [],
        total: 0,
        totalPage: 0,
        diagnostic: `HTTP ${res.status}｜total 0（回的是 recommend_productlist，不是 data 陣列）`,
      }
    }
    // 形狀不符時把實際看到的 key 講出來 —— 這支是前端 BFF，改版時這個訊息就是唯一線索
    const keys = outer && typeof outer === 'object' ? Object.keys(outer).slice(0, 8).join(',') : typeof outer
    throw new Error(
      `搜尋 API 回傳格式不符預期（data 不是陣列，實際看到的 key: ${keys}）${body?.msg ? `｜msg: ${body.msg}` : ''}`,
    )
  }
  return {
    items: items as Record<string, unknown>[],
    total,
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

  // ── 出發日期：在送出前就要驗死 ──────────────────────────
  // 後端對「日期不合法」與「這區間真的沒商品」回的是同一個形狀（都是 total:0），
  // 事後分不出來。唯一能保證 0 筆是真 0 筆的辦法，就是不讓不合法的請求出門。
  const badDate = validateDateWindow(q.saleDateFrom, q.saleDateTo)
  if (badDate) throw new Error(badDate)
  const wantsDates = !!(q.saleDateFrom || q.saleDateTo)
  const dateWindow = wantsDates ? `${q.saleDateFrom ?? '今天'} ~ ${q.saleDateTo ?? '不限'}` : undefined
  let filter: DateFilter | undefined
  if (wantsDates) {
    const csrf = await getCsrf(q.keyword)
    // 拿不到 token 就整支失敗。**不要退回沒篩選的搜尋** —— 那會讓 agent 拿著全年份的
    // 商品當成「11 月可訂」講出去，而輸出上完全看不出來篩選沒生效。
    if (!csrf) {
      throw new Error(
        '拿不到站方的 CSRF token，出發日期篩選送不出去。這次沒有回傳任何結果是刻意的 ——' +
          '回一份沒套用日期的清單會比沒有結果更糟。可以改用不帶日期的搜尋（並自行說明沒有篩日期），' +
          '或請使用者從網站的列表頁重試。',
      )
    }
    filter = { from: q.saleDateFrom, to: q.saleDateTo, csrf }
  }

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
      const r = await fetchPage(q.keyword, page, filter)
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

  // 日期篩選的語意界線。它擋掉的是「這段期間根本不賣」的商品（實測東京 594 → 542），
  // **不保證某一天還有位**。這兩件事講混了，agent 就會說「11/15 這幾個都訂得到」。
  if (wantsDates) {
    notes.push(
      `已用站方自己的「出發日期」篩選收斂到 ${dateWindow}（後端篩的，不是這一層自己比對 earliestDate）。這代表「這些商品在這段期間有在賣」，**不代表某一天還有位、也不代表那天出得了團**。要確認特定日期請開商品頁用 check_package_availability。`,
    )
  }

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
        ? `這個關鍵字${wantsDates ? `在 ${dateWindow} 內` : ''}共有 ${total} 個商品，只掃了照推薦排序的前 ${all.length} 筆（每頁 ${PAGE_SIZE} × ${maxPages} 頁上限）。符合條件的商品幾乎一定還有，回答時要說明這是前段樣本。`
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

  // ── scanned 0 的四種成因要分開講 ────────────────────────
  //
  // ⚠️ 這段原本只有一句「API 一筆商品都沒回」，但診斷字串同時印著「data.data 陣列長度 20」。
  // 兩句互相矛盾，看的人（人或 agent）只能放棄工具改去爬 DOM —— 實測就這樣浪費了一輪。
  // 成因其實有四種，而修法完全不同：
  //
  //   1. fetch 就沒拿到東西      → endpoint 改版 / 被限流。放寬條件沒用
  //   2. fetch 有拿到但 normalize 全丟 → 欄位名或**型別**變了（prod_oid 由 string 變 number）。放寬條件沒用
  //   3. 後端的日期篩選回 total 0    → **這一種放寬日期是有用的**，而且它是正常結果不是故障
  //   4. normalize 有過但條件全篩掉  → 條件太嚴（這種 all.length > 0，不會進這裡）
  //
  // 第 2 種是最會被誤判成第 1 種的。它有個明確特徵：rawCount > 0 而 all.length === 0。
  // 第 3 種是加了日期篩選之後才出現的：raw 空、total 0、而且有帶日期。
  let emptyReason: SearchResult['emptyReason']
  if (!all.length) {
    const rawCount = raw.length
    if (rawCount > 0) {
      emptyReason = 'parse'
      notes.unshift(
        `⚠️ 搜尋 API 有回 ${rawCount} 筆原始資料，但**每一筆都無法解析**（缺 id 或 name）。` +
          `這不是條件太嚴，也不是 API 掛了 —— 是回傳的欄位名或型別跟解析器對不上（例如 prod_oid ` +
          `由字串變成數字）。診斷：${diagnostics.join('；')}。請回報這個錯誤，放寬條件重試不會有幫助。`,
      )
    } else if (wantsDates && total === 0) {
      emptyReason = 'dateWindow'
      notes.unshift(
        `「${q.keyword}」在 ${dateWindow} 這段期間沒有可訂商品。這是站方日期篩選回的正常結果，不是故障 ——` +
          `換一個日期區間或拿掉日期重搜是有用的（實測 2028 年的區間就會回 0）。`,
      )
    } else {
      emptyReason = 'fetch'
      notes.unshift(
        `⚠️ 搜尋 API 一筆商品都沒回（不是條件太嚴）。診斷：${diagnostics.join('；')}。` +
          `可能是 endpoint 改版、被限流，或跑的是舊版擴充套件（請重新 build）。`,
      )
    }
  }

  return {
    query: q,
    total,
    scanned: all.length,
    matched: kept.length,
    truncated,
    hits,
    notes,
    ...(dateWindow ? { dateWindow } : {}),
    ...(emptyReason ? { emptyReason } : {}),
    ...(all.length ? {} : { fetchDiagnostic: diagnostics.join('；') }),
  }
}
