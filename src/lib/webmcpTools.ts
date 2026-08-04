// WebMCP tool 定義（純資料 + handler，不碰 modelContext API，方便單元測試）。
//
// 設計原則（依 https://developer.chrome.com/docs/ai/webmcp/best-practices 與
// spec §6 Security Considerations，並沿用 2026/07 競品研究訂下的四條紅線）：
//
//   1. 一個 tool 一件事，不重疊。tool 越多、越相似，agent 越選不對。
//   2. **數字只複製不生成**：價格 / 評分一律原樣回傳頁面上的字串或 JSON-LD 數字，
//      本層不做任何加總、比較、排序。要比較就讓 agent 自己拿數字去比，網站不背書。
//   3. **輸出有字元預算**，而且截斷一定要標註（截斷不標註，agent 會拿殘缺資料當完整事實）。
//   4. **任何含 UGC / 供應商文案的輸出都標 untrustedContentHint** —— 商品名稱與評分是
//      prompt injection 的天然載體（spec §6.3.1.2 Output Injection）。
//   5. **全部唯讀。** 現在沒有任何會改變頁面或帳號狀態的 tool。
//   6. 不暴露交易終點，也不會有。錯誤成本不對稱：摘要平淡使用者聳聳肩，扣錯款是客訴、
//      退款與法遵問題。而且 WebMCP 目前沒有 elicitation API，我們無法保證確認流程真的發生過。
//
// ── 為什麼只有兩支（2026-07-28 benchmark 之後的取捨）──────────────────────
// 曾經有 7 支，實測後砍到 2 支。判準來自 benchmark：**WebMCP 省的是「跨頁抓取與多步互動」，
// 不是「包裝單頁資料」。**
//
//   • 探索任務（列表 590 筆 / 59 頁）：有 tool 省 68% 呼叫、48% token、72% 時間
//   • 商品頁任務（12,000 字但 100% SSR、一次就在 DOM 裡）：有 tool **反而略增**
//
// 所以 `get_product_terms` / `get_product_facts` / `get_product_reviews` 全砍 —— 它們包的是
// agent 自己讀 DOM 就拿得到的東西，包一層只是多幾次往返。`read_review_draft` /
// `write_review_draft` 也砍：成本低但沒有實測價值，而且是唯一的寫入型 tool，砍掉之後整組
// 變成純唯讀，安全邊界乾淨很多。
//
// 附帶好處：被砍的那幾支正是最脆弱的部分（綁 `.tag-badge-wrapper`、`.option-content`、
// `.kk-chip--selected` 這些會隨改版消失的 class）。少維護三份會漂移的 selector。

import type { ModelContextTool } from '../webmcp/modelContext'
import { getProductId, isProductPage } from './productPage'
import { readPackageAvailability } from './packageAvailability'
import { checkDate, readAvailabilityMatrix } from './packageCalendar'
import { searchProducts, validateDateWindow, type SortId } from './productSearch'

/** Chrome 建議的單次 tool 輸出上限 */
export const MAX_OUTPUT_CHARS = 1500

/**
 * `search_products` 專用的輸出預算，**刻意高於 Chrome 建議的 1500**。
 *
 * 實測量出來的取捨（欄位已經精簡過：移掉完整 url、display_tags，currency 提到頂層，
 * 每筆從 252 字元降到 161）：
 *
 * | 輸出預算 | 塞得下幾筆 |
 * | --- | --- |
 * | 1500（Chrome 建議） | 6 筆 |
 * | 2500 | 12 筆 |
 *
 * 選 2500 的理由：這是**探索**工具，候選集太小就失去意義 —— 實測有 agent 因為只拿到 6 筆
 * （而且是被截斷的 6 筆），5 筆都是幾乎一樣的富士山一日遊，多樣性不足到得靠換 sort 呼叫
 * 三次來湊。與其讓它多打三次，不如一次給夠。
 *
 * 這是一個 dial：真的在意 context 成本就把它調回 1500，`jsonFitList` 會自動降到 6 筆並回報
 * `omittedForLength`，不會壞掉。
 */
export const SEARCH_OUTPUT_CHARS = 2500

/** 把輸出壓在上限內，並誠實標註被截斷（截斷若不標註，agent 會拿殘缺資料當完整事實） */
export function cap(text: string, limit = MAX_OUTPUT_CHARS): string {
  if (text.length <= limit) return text
  return `${text.slice(0, limit - 40)}…\n[truncated: ${text.length} chars total]`
}

/** 統一的 JSON 輸出（compact，省 token） */
function json(value: unknown, limit = MAX_OUTPUT_CHARS): string {
  return cap(JSON.stringify(value), limit)
}

/**
 * 會「縮小內容」而不是「切斷字串」的 JSON 輸出。
 *
 * ⚠️ 為什麼需要這個：原本對 JSON 直接套 `cap()`，結果**把字串切在 JSON 中間，產出不合法的
 * JSON**。實測有 agent 拿到 `Unterminated string in JSON at position 1490`，只好改用 regex
 * 硬抽欄位，於是 `matched: 43` 裡有 37 筆它永遠看不到、`limit: 20` 實際只拿到 6 筆。
 * `cap()` 是給散文用的，套在結構化輸出上就是 bug。
 *
 * 作法：逐步砍掉清單尾端的項目，直到序列化後塞得進上限，並把「因為長度被砍掉幾筆」誠實寫進
 * 輸出裡 —— 保證回去的永遠是合法 JSON。
 */
function jsonFitList<T>(
  build: (items: T[], dropped: number) => Record<string, unknown>,
  items: T[],
  limit = MAX_OUTPUT_CHARS,
): string {
  for (let n = items.length; n > 0; n -= 1) {
    const text = JSON.stringify(build(items.slice(0, n), items.length - n))
    if (text.length <= limit) return text
  }
  return JSON.stringify(build([], items.length))
}

/**
 * 錯誤一律回「可自我修正的訊息」而不是 throw。
 * Chrome 明文建議：schema 約束不保證生效，要靠描述性錯誤讓模型自己重試修正。
 */
function problem(message: string): string {
  return json({ error: message })
}

// ── Tool 定義 ─────────────────────────────────────────────

// A. Discovery —— 全站註冊，這是整組裡最重要的一支。
//
// 使用者的痛點不是「怎麼下單」，是「怎麼在 584 個東京商品裡找到適合自己的」。SRP 一頁只給
// 10 筆（584 筆 = 59 頁，分頁按鈕還沒 href），而且沒有評分篩選。
// 這支 tool 打的是 SRP 自己在用的那個 API，然後用它本來就回的 rating_star 做收斂 ——
// 也就是把「後端早就給了、前端沒用」的欄位補成可用的篩選。
//
// 出發日期（dateFrom / dateTo）是另一回事：SRP 側邊欄本來就有這個篩選器，而且是**後端篩的**
// （`filter[sale_date][from|to]`，實測東京 594 → 542）。這一層要做的不是自己發明篩選，
// 是把那個「網站有、但要點三層 UI 才碰得到」的能力直接開給 agent。細節與三個會安靜出錯的
// 坑寫在 productSearch.ts 檔頭。
//
// 參數刻意只收「SRP UI 已經有、或明顯該有」的維度。不收年齡、同行人組成、身心狀況這類
// 個人條件 —— spec §6.3.3 明列那是 over-parameterization 威脅（釣 agent 交出跨站個資 →
// silent profiling、價格歧視）。使用者說「帶 5 歲小孩」時，該由 agent 自己翻譯成
// category 與 tag 關鍵字，不是讓我們把童齡收進 schema。
const discoveryTools: ModelContextTool[] = [
  {
    name: 'search_products',
    title: '搜尋 KKday 商品',
    description:
      // ⚠️ 上限 500 字元（Chrome tool security 頁的 budget），有測試守著。
      // 「service tags」是舊描述留下來的 —— 輸出裡早就沒有 tags 了，順手拿掉。
      'Explores what KKday has for a keyword and returns a candidate set with each product\'s rating, review count, price range and earliest available date. Pass dateFrom/dateTo whenever the user names a month or dates: that is the site\'s own departure-date filter, applied server-side. The list page shows only ten per page and has no rating filter, so this is the fast way to survey options. Prices are "from" prices covering all dates and packages — read the range, do not treat it as the price.',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: 'City, attraction or product name as the user said it, e.g. "東京" or "日本esim".',
        },
        dateFrom: {
          type: 'string',
          description: 'Start of the departure window, YYYY-MM-DD. For "November" pass the first of the month. Narrows to products on sale then.',
        },
        dateTo: {
          type: 'string',
          description: 'End of the departure window, YYYY-MM-DD, e.g. "2026-11-30". Either bound may be used alone.',
        },
        minRating: { type: 'number', minimum: 1, maximum: 5, description: 'Minimum star rating, e.g. 4.5.' },
        minReviews: {
          type: 'integer',
          minimum: 0,
          description: 'Minimum review count. Set this with minRating so a 5.0 with 8 reviews cannot outrank a 4.9 with 5000.',
        },
        sort: {
          type: 'string',
          enum: ['recommended', 'rating', 'price_low', 'most_ordered'],
          description: 'Ordering of results. Defaults to the site\'s own recommended order. Call again with a different sort to widen the candidate set.',
        },
        limit: { type: 'integer', minimum: 1, maximum: 20, description: 'How many products to return. Defaults to 12.' },
      },
      required: ['keyword'],
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async execute({ keyword, dateFrom, dateTo, minRating, minReviews, sort, limit }) {
      if (typeof keyword !== 'string' || !keyword.trim()) {
        return problem('The "keyword" argument must be a non-empty string, e.g. "東京".')
      }
      // 日期在這裡就擋掉，不要送出去。站方對「日期不合法」與「這區間沒商品」回的是同一個
      // 形狀（都是 total:0），送出去之後就再也分不出來是哪一種了。
      // 驗證邏輯跟 lib 共用一份 —— 包含「2026-02-30 這種格式對但不存在的日子」，
      // 那種送出去會讓我們對一個不存在的日期宣告「這段期間沒有可訂商品」。
      const badDate = validateDateWindow(dateFrom, dateTo)
      if (badDate) return problem(badDate)
      try {
        const result = await searchProducts({
          keyword: keyword.trim(),
          saleDateFrom: typeof dateFrom === 'string' ? dateFrom : undefined,
          saleDateTo: typeof dateTo === 'string' ? dateTo : undefined,
          minRating: typeof minRating === 'number' ? minRating : undefined,
          minReviews: typeof minReviews === 'number' ? minReviews : undefined,
          sort: sort as SortId | undefined,
          limit: typeof limit === 'number' ? limit : undefined,
        })
        // 三種 0 筆要分開講。混在一起的代價實測過：拿到 scanned:0 的 agent 以為是
        // 「條件太嚴」，放寬條件重試還是 0，最後放棄 tool 改去爬 DOM。
        //
        // 日期區間那種尤其不能講成故障 —— 它是正常結果，而且**換個日期真的有用**，
        // 跟另外兩種「重試不會有幫助」剛好相反。
        if (!result.scanned && result.emptyReason === 'dateWindow') {
          return json({
            dateWindow: result.dateWindow,
            scanned: 0,
            matched: 0,
            error:
              `「${keyword.trim()}」在 ${result.dateWindow} 這段期間沒有可訂商品。這是站方日期篩選回的正常結果，` +
              '不是取資料失敗。放寬或改變日期區間、或拿掉日期重搜，是有意義的重試。',
            notes: result.notes,
          })
        }
        if (!result.scanned) {
          return json({
            scanned: 0,
            error:
              '搜尋 API 一筆商品都沒回，這不是條件太嚴的問題 —— 取資料本身失敗了。' +
              '放寬條件重試不會有幫助。請改用網站自己的搜尋頁，並回報這個錯誤。',
            diagnostic: result.fetchDiagnostic,
            notes: result.notes,
          })
        }
        if (!result.matched) {
          // 刻意**不**斷言原因。曾經寫「放寬評分或預算」，但當時真正的原因是 category
          // filter 壞掉 —— 錯誤訊息把 agent 導向錯的補救方向，讓它得出「東京沒有這種商品」
          // 這個自信但完全錯誤的結論。不知道原因就不要猜。
          return json({
            totalOnSite: result.total,
            scanned: result.scanned,
            matched: 0,
            error: `掃過的 ${result.scanned} 筆裡沒有符合條件的。可能是條件偏嚴，也可能是符合的商品排在掃描範圍之後（這個關鍵字共 ${result.total ?? '未知'} 筆）。可以放寬條件或換關鍵字重試。`,
            notes: result.notes,
          })
        }
        // 用 jsonFitList：太長時砍筆數而不是切字串，保證回去的是合法 JSON
        return jsonFitList(
          (products, dropped) => ({
            // 篩選有沒有真的生效要看得見。只寫在 notes 裡不夠 —— 實測 agent 會略過 notes，
            // 而「以為篩了其實沒篩」是這支 tool 最貴的錯法。
            ...(result.dateWindow ? { dateWindow: result.dateWindow } : {}),
            // 有日期篩選時 total 的意思變了（是「這個區間內的商品數」而不是「全站」），
            // 所以連欄位名一起換。同一個名字兩種意思，遲早會被讀成錯的那個。
            ...(result.dateWindow ? { totalInWindow: result.total } : { totalOnSite: result.total }),
            scanned: result.scanned,
            matched: result.matched,
            truncated: result.truncated,
            ...(dropped ? { omittedForLength: dropped } : {}),
            // currency 提到頂層：整批一定同幣別，逐筆重複純粹浪費預算
            currency: result.hits[0]?.currency ?? 'TWD',
            // 網址規則講一次就好，不用每筆重複 75 字元
            urlPattern: 'https://www.kkday.com/zh-tw/product/{id}',
            notes: result.notes,
            products,
          }),
          // 數字全部原樣沿用 API 回的值，這一層不換算也不重算。
          //
          // 這裡的欄位取捨是實測量出來的（每筆約 252 字元 → 1500 只塞得下 4 筆）：
          //   • 移除完整 url（省 ~75/筆）—— `/product/{id}` 本身就開得起來，slug 是多餘的，
          //     而且 `readable_url` 有時是空字串。改成頂層講一次 urlPattern
          //   • 移除 display_tags（省 ~35/筆）—— 「即買即用」「立即確認」決策價值低
          //   • currency 提到頂層（省 ~18/筆）
          result.hits.map((h) => ({
            id: h.id,
            name: h.name.slice(0, 40),
            rating: h.rating,
            reviews: h.ratingCount,
            priceFrom: h.priceFrom,
            // priceTo 只在真的有區間時才有值 —— 有值本身就是「價格取決於方案」的訊號
            ...(h.priceTo != null ? { priceTo: h.priceTo } : {}),
            ...(h.discountPct != null ? { discountPct: h.discountPct } : {}),
            earliestDate: h.earliestDate,
          })),
          SEARCH_OUTPUT_CHARS,
        )
      } catch (err) {
        return problem(`搜尋失敗：${(err as Error).message}。稍後重試，或改用網站自己的搜尋頁。`)
      }
    },
  },
]

// B. 可訂性 —— 只在商品頁註冊。
//
// 這是 benchmark 之後唯一留下來的 PDP tool，理由是它**不是在包裝 DOM 資料**：對照組為了
// 確認一個商品在 8/15 能不能訂，必須點方案 → 開日曆 → 截圖判讀，而可訂性矩陣（日期 × 方案）
// 在頁面上只存在於畫素裡。這正是「取代多步互動」，跟 search 同一類價值。
//
// 資料來源是站方自己的可訂性 API（見 packageCalendar.ts），所以**不需要使用者先在頁面上
// 選日期**；讀 DOM 的 packageAvailability 只留著做交叉檢核（API 說不可訂、畫面卻可點）。
const productTools: ModelContextTool[] = [
  {
    name: 'check_package_availability',
    title: '查方案可訂性',
    description:
      'Reports which packages on this product page can actually be booked, and how many places are left. Ask for a single date to get a yes/no per package with remaining places, or omit it to get the bookable dates for the next month. This queries the site\'s own availability data, so it does not need the user to pick a date in the page first, and it catches packages that look clickable but cannot be booked at all.',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'A single date as YYYY-MM-DD, e.g. "2026-08-15". Omit to get a whole range instead.',
        },
        from: { type: 'string', description: 'Range start as YYYY-MM-DD. Defaults to today. Ignored when date is given.' },
        to: { type: 'string', description: 'Range end as YYYY-MM-DD. Defaults to 30 days after from. Ignored when date is given.' },
      },
    },
    annotations: { readOnlyHint: true },
    async execute({ date, from, to }) {
      if (!isProductPage()) return problem('Not on a KKday product page. Navigate to a /product/<id> URL first.')
      const iso = /^\d{4}-\d{2}-\d{2}$/
      for (const [key, value] of Object.entries({ date, from, to })) {
        if (value != null && !iso.test(String(value))) {
          return problem(`The "${key}" argument must look like YYYY-MM-DD, e.g. "2026-08-15".`)
        }
      }

      // 讀 DOM 只為了交叉檢核：API 說不可訂、畫面卻讓你點，就是那個循環死巷 bug
      const dom = readPackageAvailability()
      const domWarnings = dom?.warnings ?? []

      try {
        if (typeof date === 'string') {
          const result = await checkDate(date)
          if (!result) {
            return problem('讀不到這個商品的方案資料（頁面可能還在 render，或這個商品沒有方案）。')
          }
          return json({
            productId: getProductId(),
            date: result.date,
            bookable: result.bookable.map((b) => ({ package: b.name ?? String(b.pkgOid), remain: b.remain })),
            notBookable: result.blocked.map((b) => b.name ?? String(b.pkgOid)),
            // 查不到資料的方案必須跟「確定不可訂」分開列。合在一起的話 agent 會直接告訴
            // 使用者「這些方案訂不到」，而我們其實沒有任何依據。
            ...(result.unknown.length
              ? { couldNotCheck: result.unknown.map((b) => b.name ?? String(b.pkgOid)) }
              : {}),
            notes: [...result.notes, ...domWarnings],
          })
        }

        const matrix = await readAvailabilityMatrix({ from: from as string | undefined, to: to as string | undefined })
        if (!matrix) {
          return problem('讀不到這個商品的方案資料（頁面可能還在 render，或這個商品沒有方案）。')
        }
        return json({
          productId: getProductId(),
          range: `${matrix.from} ~ ${matrix.to}`,
          uiPattern: dom?.uiPattern,
          packages: matrix.packages.map((p) => ({
            package: p.name ?? String(p.pkgOid),
            ...(p.error ? { error: p.error } : {}),
            ...(p.fullyUnavailable ? { fullyUnavailable: true } : {}),
            bookableCount: p.bookableDates.length,
            // 日期清單可能很長，只給前幾個並標註總數
            bookableDates: p.bookableDates.slice(0, 12),
            ...(p.bookableDates.length > 12 ? { moreBookableDates: p.bookableDates.length - 12 } : {}),
          })),
          notes: [...matrix.notes, ...domWarnings],
        })
      } catch (err) {
        return problem(`查可訂性失敗：${(err as Error).message}。可以改問單一日期，或請使用者在頁面上選日期後再試。`)
      }
    },
  },
]

/**
 * 依目前頁面決定要註冊哪些 tool。
 *
 * `search_products` **全站都註冊** —— discovery 是使用者真正卡住的地方，而它卡在
 * 首頁與列表頁，不是商品頁。只在 PDP 註冊 tool 等於「使用者已經自己找到商品之後，
 * 我們才開始幫忙」，那是幫在最不需要幫的地方。
 *
 * 其餘依頁面狀態註冊（Chrome 建議：頁面狀態用不到的 tool 就不要註冊，
 * tool 越多越相似，agent 越選不對）。
 */
export function toolsForCurrentPage(): ModelContextTool[] {
  if (isProductPage()) return [...discoveryTools, ...productTools]
  return discoveryTools
}

export const ALL_TOOLS = [...discoveryTools, ...productTools]
