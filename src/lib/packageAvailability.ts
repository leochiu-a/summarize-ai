// KKday PDP「方案可訂性」擷取。
//
// 為什麼需要這個模組：日期 × 方案（× 導覽語言 × 行程類型）的可訂性矩陣，在 KKday 目前
// **只存在於畫素裡** —— 沒有 URL 參數、沒有可讀的 API，DOM 上也只有一段中文 badge 文字。
// 使用者要知道「我 8/15 能訂哪個方案」只能一個一個點下去試，agent 更是完全沒轍。
//
// 更糟的是實測到的 bug（走查 2026-07-27，商品 12319）：標示「該日期無法訂購」的方案
// **仍然可以點**，點下去撞的 modal 叫你改日期，而改日期的 modal 叫你改方案 —— 循環死巷。
// 系統渲染時就已經算出 badge，代表可訂性資料在前端已經有了，只是沒有 disable UI、
// 也沒有任何機器可讀的出口。
//
// ── 實機驗證（2026-07-28，Chrome 151，真實 kkday.com）─────────────────────
// 同一個 PDP 模板底下是**兩套完全不同的 DOM**，必須分開處理：
//
//   A. 票券型（商品 133300 澀谷SKY）：方案是整張卡，卡內有 `button.select-option`，
//      文字為「選擇 / 取消選擇 / 已售罄」。卡片容器是 `.option-content` / `.option-head`
//      （實測單張 1,004 字，對得上走查記的「方案卡內嵌條文 ~950 字」）。
//      這頁沒有任何 `.tag-badge-wrapper`。
//
//   B. 一日遊型（商品 12319 富士山）：方案是 radio chip —— `.tag-badge-wrapper > .kk-chip`，
//      名稱在 `.kk-chip__label`，折扣 / 狀態 badge 在 wrapper 內、chip 外。
//      **這一型完全沒有「選擇」按鈕**，所以只靠 CTA 文字反查會抓到 0 個方案。
//      區塊標題是 `h4.package-section-title`（不是 h2/h3），而且**不在 `.info-section` 裡**。
//
// 另外實測到一件比走查記錄更嚴重的事：那些 chip **完全沒有 a11y 語意** ——
// 沒有 `role`、沒有 `aria-checked`、沒有 `aria-selected`、沒有 `aria-disabled`、沒有 `tabindex`，
// 選中狀態**只靠 class `kk-chip--selected` 表達**。所以問題不只是「不可訂的方案沒 disable」，
// 而是整組單選群組對輔助科技與 agent 都是不可見的。這也一併回報成 warning。
//
// 選擇器策略沿用本專案既有原則：優先用相對穩定的 id / 語意 class / 標題文字反查，
// 不綁 Vue 的 data-v-* 與純樣式 class。

/** 方案在「目前已選日期」下的可訂狀態 */
export type PackageStatus =
  /** 可選 */
  | 'selectable'
  /** 已售罄 */
  | 'sold_out'
  /** 該日期無法訂購 */
  | 'unavailable_on_date'
  /** 有卡片但讀不出狀態訊號 */
  | 'unknown'

/** 這個 PDP 用的是哪一套方案選擇器 UI（同站兩套，見檔頭說明） */
export type PackageUiPattern = 'ticket-card' | 'tour-chip'

export interface PackageOption {
  name: string
  /** 頁面上原樣顯示的價格字串（例 'NT$534'）。刻意保留字串：數字只複製不重算。 */
  price?: string
  status: PackageStatus
  /** 目前是否為選中的方案 */
  selected: boolean
  /**
   * 這個方案現在是否真的可以點。
   * status 為 'unavailable_on_date' / 'sold_out' 但 clickable 為 true → 就是循環死巷那個 bug。
   */
  clickable: boolean
  /** 卡片 / badge 上的原始狀態文字（供交叉核對，不要拿去做判斷） */
  statusText?: string
}

export interface PackageAvailability {
  uiPattern: PackageUiPattern
  /** 目前選中的日期（讀得到才有；票券型沒有全域日期選擇器 → 常為 null） */
  selectedDate: string | null
  packages: PackageOption[]
  /** 讀取過程中發現的資料品質 / a11y 問題，會直接進 tool 輸出 */
  warnings: string[]
}

// 方案區的標題（同一功能，KKday 站內有四個名字：票券 / 一日遊 / 觀光行程 / 票種）
const SECTION_TITLE_RE = /選擇方案|景點門票|觀光行程|選擇票種/
// 票券型的 CTA 按鈕文字
const CTA_RE = /^\s*(選擇|取消選擇|已售罄|Select|Selected|Sold\s*out)\s*$/
const SOLD_OUT_RE = /已售罄|Sold\s*out/
// 走查實測到的「該日期不可訂」提示（同時涵蓋 badge 與 modal 兩種措辭）
const DATE_BLOCKED_RE = /該日期無法訂購|此方案於該日無法訂購|該日無法訂購/
const DATE_TEXT_RE = /\d{1,2}\s*月\s*\d{1,2}|\d{4}[/-]\d{1,2}[/-]\d{1,2}/
const PRICE_RE = /(?:NT\$|TWD|JPY|US\$)\s?[\d,]+(?:\.\d+)?/

// 實機確認的語意 class（比爬 DOM 穩，但仍保留純文字 fallback）
const TICKET_CTA_SELECTOR = 'button.select-option'
const TICKET_CARD_SELECTOR = '.option-content, .option-head'
const CHIP_WRAPPER_SELECTOR = '.tag-badge-wrapper'
const CHIP_SELECTOR = '.kk-chip'
const CHIP_LABEL_SELECTOR = '.kk-chip__label'
const CHIP_SELECTED_RE = /kk-chip--selected/
const NAME_SELECTOR = 'h3, h4, h5, [class*="title"], [class*="name"]'

/**
 * 定位方案選擇區。
 * 一日遊型的標題是 `h4.package-section-title` 且不在 `.info-section` 裡，
 * 所以除了 h2/h3 之外一定要看 h4，並在找不到 `.info-section` 時往上爬到夠大的容器。
 */
export function findPackageSection(doc: Document = document): HTMLElement | null {
  const byId = doc.querySelector<HTMLElement>('#package-sec, #product-package-sec')
  if (byId) return byId

  const byClass = doc.querySelector<HTMLElement>('h4.package-section-title, .package-section-title')
  if (byClass) return climbToContainer(byClass)

  const title = [...doc.querySelectorAll<HTMLElement>('h2.info-title, h2, h3, h4')].find((h) =>
    SECTION_TITLE_RE.test(h.textContent || ''),
  )
  if (!title) return null
  return (title.closest('.info-section') as HTMLElement) ?? climbToContainer(title)
}

// 從標題往上爬到「裝得下整個方案區」的容器（實測一日遊型要爬 4–5 層）
function climbToContainer(from: HTMLElement): HTMLElement {
  let node: HTMLElement = from
  for (let i = 0; i < 6 && node.parentElement; i += 1) {
    node = node.parentElement
    if ((node.innerText || node.textContent || '').length > 400) break
  }
  return node
}

// 這個元素現在是否真的可以點。任一封鎖訊號成立就算不可點。
// 注意：jsdom 沒有排版引擎，getComputedStyle 只回宣告值 —— 對單元測試夠用
//（我們測的是「有沒有宣告 pointer-events:none / aria-disabled」這件事本身）。
function isClickable(el: HTMLElement): boolean {
  if (el.getAttribute('aria-disabled') === 'true') return false
  if ((el as HTMLButtonElement).disabled === true) return false
  if (el.className && /\bdisabled\b/.test(el.className.toString())) return false
  try {
    if (el.ownerDocument.defaultView?.getComputedStyle(el).pointerEvents === 'none') return false
  } catch {
    /* 拿不到 computed style 就當可點（保守：寧可誤報 bug 也不要漏報） */
  }
  return true
}

function statusFromText(text: string): { status: PackageStatus; statusText?: string } | null {
  const flat = text.replace(/\s+/g, ' ')
  if (DATE_BLOCKED_RE.test(flat)) {
    return { status: 'unavailable_on_date', statusText: flat.match(DATE_BLOCKED_RE)?.[0] }
  }
  if (SOLD_OUT_RE.test(flat)) {
    return { status: 'sold_out', statusText: flat.match(SOLD_OUT_RE)?.[0] }
  }
  return null
}

function priceIn(el: HTMLElement): string | undefined {
  return (el.textContent || '').match(PRICE_RE)?.[0]
}

// ── A. 票券型：整張卡 + `button.select-option` ────────────────────────────

function ctasIn(root: HTMLElement): HTMLElement[] {
  const semantic = [...root.querySelectorAll<HTMLElement>(TICKET_CTA_SELECTOR)]
  if (semantic.length) return semantic
  // fallback：class 改了就靠文字反查
  return [...root.querySelectorAll<HTMLElement>('button, a, [role="button"], .kk-button-base')].filter((b) =>
    CTA_RE.test(b.textContent || ''),
  )
}

// 從 CTA 往上找「整張方案卡」。優先用實機確認的語意 class，退回爬 DOM：
// 這一層像一張卡（有方案名節點，或文字已達 40 字），且不要爬到把所有方案都包進來的容器。
function cardFor(cta: HTMLElement, root: HTMLElement): HTMLElement | null {
  const semantic = cta.closest<HTMLElement>(TICKET_CARD_SELECTOR)
  if (semantic) return semantic

  let node: HTMLElement | null = cta.parentElement
  let best: HTMLElement | null = null
  for (let depth = 0; node && node !== root && depth < 8; depth += 1, node = node.parentElement) {
    if (ctasIn(node).length > 1) break // 再往上就把別的方案也吃進來了
    const looksLikeCard = node.querySelector(NAME_SELECTOR) !== null || (node.textContent || '').trim().length >= 40
    if (looksLikeCard) best = node
  }
  return best
}

function nameOf(el: HTMLElement): string {
  const heading = el.querySelector<HTMLElement>(NAME_SELECTOR)
  return (heading?.textContent || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)
}

function readTicketCards(section: HTMLElement, warnings: string[]): PackageOption[] {
  const seen = new Set<HTMLElement>()
  const packages: PackageOption[] = []

  for (const cta of ctasIn(section)) {
    const card = cardFor(cta, section)
    if (!card || seen.has(card)) continue
    seen.add(card)

    const status = statusFromText(card.textContent || '') ?? {
      status: 'selectable' as PackageStatus,
      statusText: (cta.textContent || '').trim(),
    }
    // 票券型的可點性看 CTA 本身（卡片外框永遠可點）
    packages.push({
      name: nameOf(card),
      price: priceIn(card),
      status: status.status,
      selected: /取消選擇|Selected/.test(cta.textContent || ''),
      clickable: isClickable(cta),
      statusText: status.statusText,
    })
  }

  if (!packages.length) warnings.push('找到方案區但讀不出任何方案卡，選擇器可能已失效')
  return packages
}

// ── B. 一日遊型：`.tag-badge-wrapper > .kk-chip` radio chip ───────────────

function readTourChips(section: HTMLElement, warnings: string[]): PackageOption[] {
  const wrappers = [...section.querySelectorAll<HTMLElement>(CHIP_WRAPPER_SELECTOR)]
  const packages: PackageOption[] = []
  let anyAria = false

  for (const wrapper of wrappers) {
    const chip = wrapper.querySelector<HTMLElement>(CHIP_SELECTOR)
    if (!chip) continue
    const label = wrapper.querySelector<HTMLElement>(CHIP_LABEL_SELECTOR)
    const name = (label?.textContent || chip.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)
    // wrapper 內、label 外的文字就是 badge（折扣或「該日期無法訂購」）
    const badge = (wrapper.textContent || '').replace(label?.textContent || '', '').replace(/\s+/g, ' ').trim()

    const status = statusFromText(badge) ?? { status: 'selectable' as PackageStatus, statusText: badge || undefined }
    if (chip.getAttribute('role') || chip.getAttribute('aria-checked') || chip.getAttribute('aria-selected')) {
      anyAria = true
    }

    packages.push({
      name,
      price: priceIn(wrapper),
      status: status.status,
      selected: CHIP_SELECTED_RE.test(chip.className?.toString() || ''),
      clickable: isClickable(chip),
      statusText: status.statusText,
    })
  }

  if (!packages.length) {
    warnings.push('找到方案區但讀不出任何方案 chip，選擇器可能已失效')
  } else if (!anyAria) {
    // 實機確認：chip 完全沒有 role / aria-checked / aria-selected / tabindex，
    // 選中狀態只靠 class 表達 → 螢幕閱讀器與 agent 都讀不出這是一組單選
    warnings.push(
      `方案 chip 群組沒有任何 a11y 語意（缺 role=radiogroup / radio 與 aria-checked），` +
        `選中狀態只靠 class kk-chip--selected 表達 —— 輔助科技與 agent 都無法得知目前選了哪個方案`,
    )
  }
  return packages
}

/** 讀出目前選中的日期。讀不到回 null（票券型沒有全域日期選擇器）。 */
export function readSelectedDate(doc: Document = document): string | null {
  const candidates = [
    ...doc.querySelectorAll<HTMLElement>(
      `${CHIP_SELECTOR}[class*="selected"], [aria-selected="true"], [aria-current="date"], .selected, .active, .is-active, .is-selected`,
    ),
  ]
  for (const el of candidates) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
    const hit = text.match(DATE_TEXT_RE)
    if (hit && text.length <= 40) return hit[0]
  }
  return null
}

/**
 * 擷取目前 DOM 狀態下的方案可訂性矩陣。
 * 純讀取、不點擊、不改動頁面 —— 只回報「畫面現在說了什麼」。
 * 自動判斷是票券型（整張卡 + 選擇按鈕）還是一日遊型（radio chip）。
 */
export function readPackageAvailability(doc: Document = document): PackageAvailability | null {
  const section = findPackageSection(doc)
  if (!section) return null

  const warnings: string[] = []
  const hasChips = section.querySelector(CHIP_WRAPPER_SELECTOR) !== null
  const uiPattern: PackageUiPattern = hasChips ? 'tour-chip' : 'ticket-card'
  const packages = hasChips ? readTourChips(section, warnings) : readTicketCards(section, warnings)

  // 循環死巷 bug：不可訂卻仍可點
  for (const pkg of packages) {
    if (pkg.clickable && (pkg.status === 'unavailable_on_date' || pkg.status === 'sold_out')) {
      warnings.push(
        `方案「${pkg.name.slice(0, 30)}」狀態為 ${pkg.status}，但仍可點擊（缺 aria-disabled / pointer-events:none）`,
      )
    }
  }

  return { uiPattern, selectedDate: readSelectedDate(doc), packages, warnings }
}
