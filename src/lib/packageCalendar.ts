// KKday 方案可訂性 —— 打站方自己的可訂性 API，取代讀 DOM badge。
//
// ── 為什麼要有這一層 ────────────────────────────────────────────────────
// 原本 [`packageAvailability.ts`](./packageAvailability.ts) 是讀畫面上的 badge 文字反推可訂性。
// 那個做法有兩個致命問題，而且都被實測抓到了（2026-07-29，商品 12319）：
//
//   1. **使用者沒在 UI 上選日期時，畫面上根本沒有可訂性資訊**，`selectedDate` 為 null，
//      tool 就答不了「8/15 訂得到嗎」——而那正是使用者唯一想問的問題。
//   2. **畫面會說謊。**DOM 版回報四個方案全部 `selectable`，但 API 顯示其中一個
//      （pkg 1986735「冬春季限定」）**整個 8 月完全不可訂**。畫面上它是一個可點的 chip，
//      沒有任何 badge。
//
// 所以這一層改成打 `fetch-items-data`，一次拿整個月的逐日狀態；
// `packageAvailability.ts` 保留下來當**交叉檢核**用（比對「API 說不可訂」vs「畫面說可點」），
// 它產出的 a11y 與 dead-end warning 仍然有價值。
//
// ── API（實機驗證）──────────────────────────────────────────────────────
// `GET /api/_nuxt/product/fetch-items-data`
//   pkgOid          必填
//   itemOidList[]   必填，**不帶會回 HTTP 500**
//   beginDate / endDate   YYYY-MM-DD，一次可拿整個月
//   shouldInstantCalendar / vertical / previewToken   選填
//
// 回傳：`data[itemOid].calendar["2026-08-15"] = { date, is_saleable, is_sold_out,
//        can_be_start, can_be_end, is_discounted, remain_qty: { fullday: 41 }, events }`
//
// **`remain_qty` 是頁面上完全沒有揭露的資訊** —— 走查記錄的痛點之一是「場次 dropdown 不顯示
// 剩餘庫存」，API 一直都有。
//
// ── pkgOid 與 itemOidList 從哪裡來 ─────────────────────────────────────
// 從 `window.__NUXT__` 撈。這是 WebMCP 層跑在 **MAIN world** 的直接好處：ISOLATED world
// 拿不到頁面的 JS 變數。方案物件的形狀是 `{ pkg_oid: number, items: number[], name, ... }`，
// 埋在 payload 深處（實測要遞迴找），而且會重複出現，需要依 pkg_oid 去重。
//
// ⚠️ 這是**內部 BFF**（路徑帶 `_nuxt`），不是對外承諾的介面，會隨前端重構改動。
// 已列進給前端的問題清單。這一層所有錯誤都不 throw 給 agent，改回可讀訊息。

const ENDPOINT = '/api/_nuxt/product/fetch-items-data'
/** 一次查幾天的上限。31 天實測沒問題；不開放更大範圍以免變成掃描工具。 */
export const MAX_RANGE_DAYS = 62
/** 最多查幾個方案，避免一個商品有 20 個方案時打爆 */
export const MAX_PACKAGES = 8
const REQUEST_DELAY_MS = 300

export interface NuxtPackage {
  pkgOid: number
  itemOids: number[]
  name?: string
}

export interface DayAvailability {
  date: string
  saleable: boolean
  soldOut: boolean
  /**
   * 剩餘數量，**依 item（票種）分開保留**：外層 key 是 itemOid，內層 key 依商品型態而異
   * （實測全日型是 `fullday`）。頁面上完全看不到這個資訊。
   *
   * 刻意不把多個票種加總成一個數字 —— 本層的原則是「只複製不生成」，而且票種之間的庫存
   * 是否共用尚未確認（已列進給後端的問題清單）。加總會產出一個看起來精確、實際沒有根據的數字。
   */
  remain?: Record<string, Record<string, number>>
}

export interface PackageAvailabilityRange {
  pkgOid: number
  name?: string
  /** 查詢範圍內可訂的日期（YYYY-MM-DD） */
  bookableDates: string[]
  /** 查詢範圍內不可訂的日期 */
  blockedDates: string[]
  /** 整個查詢範圍都不可訂 —— 這種方案在畫面上常常還是可點的 */
  fullyUnavailable: boolean
  /** 錯誤時填，其餘欄位會是空的 */
  error?: string
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : undefined
}

/**
 * 從 `window.__NUXT__` 遞迴找出所有方案（帶 `pkg_oid` 與 `items` 陣列的物件），依 pkg_oid 去重。
 * 找不到回空陣列，永不 throw —— payload 結構隨前端改版變動是預期中的事。
 */
export function readPackagesFromPayload(win: Window & typeof globalThis = window): NuxtPackage[] {
  const payload = (win as unknown as { __NUXT__?: unknown }).__NUXT__
  if (!payload) return []

  const found = new Map<number, NuxtPackage>()
  const seen = new Set<unknown>()
  const walk = (node: unknown, depth: number): void => {
    if (depth > 10 || node === null || typeof node !== 'object') return
    if (seen.has(node)) return // payload 有共用引用，不去重會爆
    seen.add(node)

    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth + 1)
      return
    }
    const obj = node as Record<string, unknown>
    const pkgOid = num(obj.pkg_oid)
    if (pkgOid != null && Array.isArray(obj.items)) {
      const itemOids = obj.items.map(num).filter((n): n is number => n != null)
      if (itemOids.length && !found.has(pkgOid)) {
        found.set(pkgOid, {
          pkgOid,
          itemOids,
          name: typeof obj.name === 'string' ? obj.name.replace(/\s+/g, ' ').trim().slice(0, 60) : undefined,
        })
      }
    }
    for (const child of Object.values(obj)) walk(child, depth + 1)
  }
  walk(payload, 0)
  return [...found.values()]
}

/**
 * 今天（**本地時區**）。
 *
 * ⚠️ 不要改回 `toISOString().slice(0, 10)` —— 那是 UTC。台灣（UTC+8）在當地 00:00–08:00
 * 之間呼叫會拿到昨天，於是預設查詢範圍從一個已經過去的日子起算。`sv-SE` 的日期格式
 * 剛好就是 `YYYY-MM-DD`，而且走本地時區。
 */
function isoToday(): string {
  return new Date().toLocaleDateString('sv-SE')
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** 查一個方案在 [from, to] 之間的逐日可訂性。 */
export async function fetchPackageCalendar(
  pkg: NuxtPackage,
  from: string,
  to: string,
): Promise<DayAvailability[]> {
  const url = new URL(ENDPOINT, location.origin)
  url.searchParams.set('pkgOid', String(pkg.pkgOid))
  // itemOidList[] 是必填 —— 少了它 API 回 HTTP 500
  for (const oid of pkg.itemOids) url.searchParams.append('itemOidList[]', String(oid))
  url.searchParams.set('beginDate', from)
  url.searchParams.set('endDate', to)
  url.searchParams.set('shouldInstantCalendar', 'true')

  const res = await fetch(url, { headers: { accept: 'application/json' }, credentials: 'same-origin' })
  if (!res.ok) throw new Error(`可訂性 API 回 HTTP ${res.status}`)
  const body = (await res.json()) as { data?: Record<string, { calendar?: Record<string, unknown> }> }
  // 一個方案可能有多個 item（票種）。可訂性取聯集：任一票種可訂就算該日可訂。
  // remain 則相反 —— 依 itemOid 分開存，不合併也不加總（見 DayAvailability.remain 的說明）。
  const byDate = new Map<string, DayAvailability>()
  for (const [itemOid, item] of Object.entries(body?.data ?? {})) {
    for (const [date, raw] of Object.entries(item?.calendar ?? {})) {
      const day = raw as Record<string, unknown>
      const saleable = day.is_saleable === true
      const soldOut = day.is_sold_out === true
      const prev = byDate.get(date)
      const remain =
        typeof day.remain_qty === 'object' && day.remain_qty !== null
          ? { ...prev?.remain, [itemOid]: day.remain_qty as Record<string, number> }
          : prev?.remain
      byDate.set(date, {
        date,
        saleable: (prev?.saleable ?? false) || saleable,
        soldOut: prev ? prev.soldOut && soldOut : soldOut,
        remain,
      })
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export interface MatrixOptions {
  /** 起日，預設今天 */
  from?: string
  /** 迄日，預設 from + 30 天 */
  to?: string
}

export interface AvailabilityMatrix {
  from: string
  to: string
  packages: PackageAvailabilityRange[]
  notes: string[]
}

/**
 * 讀出「方案 × 日期」的可訂性矩陣。
 *
 * 這是頁面上唯一無法用讀 DOM 取代的資訊：可訂性矩陣在畫面上只存在於畫素裡，而且要點方案、
 * 開日曆、逐格判讀才看得到。
 */
export async function readAvailabilityMatrix(options: MatrixOptions = {}): Promise<AvailabilityMatrix | null> {
  const packages = readPackagesFromPayload()
  if (!packages.length) return null

  const from = options.from ?? isoToday()
  const requestedTo = options.to ?? addDays(from, 30)
  const span = daysBetween(from, requestedTo)
  const notes: string[] = []
  let to = requestedTo
  if (span < 0) {
    to = from
  } else if (span > MAX_RANGE_DAYS) {
    to = addDays(from, MAX_RANGE_DAYS)
    notes.push(`查詢範圍超過 ${MAX_RANGE_DAYS} 天上限，已截到 ${to}。`)
  }

  const targets = packages.slice(0, MAX_PACKAGES)
  if (packages.length > targets.length) {
    notes.push(`這個商品有 ${packages.length} 個方案，只查了前 ${targets.length} 個。`)
  }

  const out: PackageAvailabilityRange[] = []
  for (const [i, pkg] of targets.entries()) {
    try {
      const days = await fetchPackageCalendar(pkg, from, to)
      const bookable = days.filter((d) => d.saleable && !d.soldOut).map((d) => d.date)
      const blocked = days.filter((d) => !d.saleable || d.soldOut).map((d) => d.date)
      out.push({
        pkgOid: pkg.pkgOid,
        name: pkg.name,
        bookableDates: bookable,
        blockedDates: blocked,
        fullyUnavailable: days.length > 0 && bookable.length === 0,
      })
    } catch (err) {
      // 一個方案失敗不該讓整個矩陣消失 —— 誠實標註哪一個沒查到
      out.push({
        pkgOid: pkg.pkgOid,
        name: pkg.name,
        bookableDates: [],
        blockedDates: [],
        fullyUnavailable: false,
        error: (err as Error).message,
      })
    }
    if (i < targets.length - 1) await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS))
  }

  const dead = out.filter((p) => p.fullyUnavailable)
  if (dead.length) {
    notes.push(
      `${dead.length} 個方案在 ${from}～${to} 之間完全不可訂。⚠️ 實測這種方案在畫面上通常仍是可點的 chip、` +
        `而且沒有任何 badge —— 使用者點下去才會撞錯誤，所以務必主動告知，不要讓使用者自己試。`,
    )
  }
  if (out.some((p) => p.error)) notes.push('部分方案查詢失敗，該方案的日期清單是空的，不代表不可訂。')

  return { from, to, packages: out, notes }
}

interface PackageRef {
  pkgOid: number
  name?: string
}

/**
 * 查單一日期能訂哪些方案。回傳含剩餘數量。
 *
 * ⚠️ **「不可訂」與「查不到」是兩件事，不可以合併。** API 沒有回這一天的 calendar entry
 * （超出開賣區間、當日無場次、或回了空 calendar）時，我們知道的是「沒有資料」，不是
 * 「訂不到」。把後者當成前者回報，agent 就會自信地告訴使用者某個方案訂不到 —— 這正是
 * 這一整層想避免的失敗模式（見檔頭：畫面會說謊）。所以第三類 `unknown` 要獨立存在。
 */
export async function checkDate(date: string): Promise<{
  date: string
  bookable: (PackageRef & { remain?: Record<string, Record<string, number>> })[]
  blocked: PackageRef[]
  /** 查不到該日期資料的方案。**不代表不可訂**，只代表我們沒有依據 */
  unknown: PackageRef[]
  notes: string[]
} | null> {
  const packages = readPackagesFromPayload()
  if (!packages.length) return null

  const bookable: (PackageRef & { remain?: Record<string, Record<string, number>> })[] = []
  const blocked: PackageRef[] = []
  const unknown: PackageRef[] = []
  const notes: string[] = []
  const targets = packages.slice(0, MAX_PACKAGES)

  for (const [i, pkg] of targets.entries()) {
    try {
      const days = await fetchPackageCalendar(pkg, date, date)
      const day = days.find((d) => d.date === date)
      if (!day) {
        unknown.push({ pkgOid: pkg.pkgOid, name: pkg.name })
      } else if (day.saleable && !day.soldOut) {
        bookable.push({ pkgOid: pkg.pkgOid, name: pkg.name, remain: day.remain })
      } else {
        blocked.push({ pkgOid: pkg.pkgOid, name: pkg.name })
      }
    } catch (err) {
      unknown.push({ pkgOid: pkg.pkgOid, name: pkg.name })
      notes.push(`方案 ${pkg.pkgOid} 查詢失敗：${(err as Error).message}`)
    }
    if (i < targets.length - 1) await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS))
  }

  if (blocked.length) {
    notes.push(
      `${blocked.length} 個方案在 ${date} 不可訂。⚠️ 畫面上這些方案通常仍是可點的，主動告知使用者比讓他自己試好。`,
    )
  }
  if (unknown.length) {
    notes.push(
      `${unknown.length} 個方案查不到 ${date} 的資料（API 沒有回這天）。⚠️ 這**不等於不可訂**，只代表沒有依據 —— ` +
        `不要告訴使用者這些方案訂不到，請他到頁面上自行確認。`,
    )
  }
  if (bookable.some((b) => b.remain)) {
    notes.push(
      'remain 是剩餘可訂數量，外層 key 是票種 id。這個資訊頁面上不會顯示，轉述時可以講，' +
        '但不要當成保證（庫存隨時變動），也不要把多個票種的數字加總。',
    )
  }
  return { date, bookable, blocked, unknown, notes }
}
