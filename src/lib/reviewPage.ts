// KKday 評論頁專用：頁面偵測 + 讀寫評論輸入框 + 讀這張表單已經填好的脈絡。
// 情境：使用者在「訂單 → 評論」頁自己寫評論，輸入框下方有一排 AI 按鈕（見 reviewPageToolbar.ts）。
// 產出一律只是「候選文字」，要使用者按「套用」才寫回輸入框，且永遠不代送。

// 評論頁 URL：/order/comment/<訂單編號>（相容 /zh-tw/... 這種 locale 前綴）
const REVIEW_PATH_RE = /\/order\/comment\/[\w-]+/

/** AI 工具列的 shadow host id（注入層與守衛 observer 共用，冪等判斷靠它）。 */
export const REVIEW_TOOLBAR_HOST_ID = 'summarize-ai-review-toolbar-host'

export function isReviewPage(): boolean {
  return REVIEW_PATH_RE.test(location.pathname)
}

// 定位評論輸入框。先用通用 selector（之後可在實機對真實 class 收斂）：
// 優先找 placeholder 帶「體驗 / 想法」字樣的 textarea，退回頁面第一個 textarea。
export function getReviewTextarea(): HTMLTextAreaElement | null {
  const byPlaceholder = [...document.querySelectorAll<HTMLTextAreaElement>('textarea')].find((el) =>
    /體驗|想法|評論|感想/.test(el.placeholder || ''),
  )
  return byPlaceholder ?? document.querySelector<HTMLTextAreaElement>('textarea')
}

// 讀取使用者目前寫的評論文字（去頭尾空白）。抓不到框或空白回空字串。
export function readReviewDraft(): string {
  return getReviewTextarea()?.value.trim() ?? ''
}

/**
 * 評論的字數上限（吃輸入框自己的 maxlength，實機是 900）。沒設就回 null。
 * 生成前要告訴模型別超過，套用時也照這個上限截斷——maxlength 只擋鍵盤輸入，
 * 程式寫入 value 不受它限制，超長會直接被送出端截掉或退件。
 */
export function reviewDraftLimit(): number | null {
  const max = getReviewTextarea()?.maxLength ?? -1
  return max > 0 ? max : null
}

/**
 * 這張表單使用者已經填好的東西，當作「幫我開頭」的素材。
 * 全部只讀「他自己選的事實」——商品、幾顆星、跟誰去、標題——絕不讓模型從別處腦補。
 *
 * 定位一律走語意線索（表單欄位 name、商品連結 + 標題），不綁樣式 class 或框架屬性。
 */
export interface ReviewContext {
  productName: string // 商品名稱（訂單卡片上連到 /product/<id> 的標題）
  rating: number | null // 使用者給的星等（1～5），還沒點就是 null
  travellerType: string // 這次旅行的類別（情侶 / 家人 / 好友…），沒選為空字串
  title: string // 使用者已經打的評論標題，沒打為空字串
}

export function readReviewContext(): ReviewContext {
  return {
    productName: text(document.querySelector('a[href*="/product/"] h1, a[href*="/product/"] h2')),
    rating: readRating(),
    travellerType: (
      document.querySelector<HTMLInputElement>('input[name="travellerType"]:checked')?.value ?? ''
    ).trim(),
    title: (document.querySelector<HTMLInputElement>('input[name="recTitle"]')?.value ?? '').trim(),
  }
}

function text(el: Element | null): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

// 星等：評分是一排 <li>，選到幾顆星只反映在 icon 上。星星元件自己會把結果寫進
// data-validate-value（表單驗證讀的就是它），優先信它；沒有就退回數「實心星」的顆數。
function readRating(): number | null {
  const list = document.querySelector('[name="recScore"]')
  if (!list) return null

  const declared = Number(list.getAttribute('data-validate-value'))
  if (Number.isInteger(declared) && declared > 0) return declared

  const filled = [...list.querySelectorAll('i')].filter((i) =>
    /(^|\s)fa-star(\s|$)/.test(i.className),
  ).length
  return filled > 0 ? filled : null
}

/**
 * 等評論輸入框出現（SPA / 晚 render 都可能），出現就呼叫一次 cb。
 * 已經在畫面上就同步呼叫。回傳解除函式（取消等待）。
 */
export function waitForReviewTextarea(
  cb: (el: HTMLTextAreaElement) => void,
  timeoutMs = 15000,
): () => void {
  const existing = getReviewTextarea()
  if (existing) {
    cb(existing)
    return () => {}
  }

  let done = false
  const observer = new MutationObserver(() => {
    const el = getReviewTextarea()
    if (!el || done) return
    done = true
    cleanup()
    cb(el)
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  const timer = setTimeout(() => {
    done = true
    cleanup()
  }, timeoutMs)

  function cleanup(): void {
    observer.disconnect()
    clearTimeout(timer)
  }

  return () => {
    done = true
    cleanup()
  }
}

// 監聽評論輸入框的即時字數（去頭尾空白後的長度），讓按鈕能跟著使用者打字開關。
// textarea 可能晚 render，先等它出現再掛 input 監聽；掛上後立即回報一次目前長度。
// 回傳解除函式（移除監聽 + 停止等待）。
export function watchReviewDraft(onLength: (len: number) => void, timeoutMs = 15000): () => void {
  let textarea: HTMLTextAreaElement | null = null
  const handler = () => onLength(textarea?.value.trim().length ?? 0)

  const cancelWait = waitForReviewTextarea((el) => {
    textarea = el
    el.addEventListener('input', handler)
    handler() // 立即回報目前長度（可能已有草稿）
  }, timeoutMs)

  return () => {
    cancelWait()
    textarea?.removeEventListener('input', handler)
  }
}

// 把 AI 產出的文字寫回輸入框。頁面可能用框架接管這個框（Vue v-model / jQuery 都有可能），
// 直接改 .value 框架不會察覺 → 用原生 setter 寫入再派發 input/change 事件，
// 讓雙向綁定與字數計算同步（否則使用者送出時送的還是舊值）。
// 超過 maxlength 的部分先截掉：程式寫入不受 maxlength 限制，留著只會在送出時才爆。
export function writeReviewDraft(text: string): boolean {
  const el = getReviewTextarea()
  if (!el) return false

  const limit = el.maxLength > 0 ? el.maxLength : null
  const value = limit ? text.slice(0, limit) : text

  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value

  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}
