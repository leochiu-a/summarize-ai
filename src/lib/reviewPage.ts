// KKday 評論頁專用：頁面偵測 + 讀寫評論輸入框。
// 情境：使用者在「訂單 → 評論」頁自己寫評論，buddy 陪著，寫好點 buddy 幫潤飾。
// 潤飾只吃輸入框現有文字（不帶頁面脈絡），結果寫回同一個框讓使用者再改、自己送出。

// 評論頁 URL：/order/comment/<訂單編號>（相容 /zh-tw/... 這種 locale 前綴）
const REVIEW_PATH_RE = /\/order\/comment\/[\w-]+/

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

// 監聽評論輸入框的即時字數（去頭尾空白後的長度），讓 buddy 跟著使用者打字更新提示。
// textarea 可能 SPA 晚 render，先等它出現再掛 input 監聽；掛上後立即回報一次目前長度。
// 回傳解除函式（移除監聽 + 停止等待）。
export function watchReviewDraft(onLength: (len: number) => void, timeoutMs = 15000): () => void {
  let textarea: HTMLTextAreaElement | null = null
  const handler = () => onLength(textarea?.value.trim().length ?? 0)

  const attach = (el: HTMLTextAreaElement) => {
    textarea = el
    el.addEventListener('input', handler)
    handler() // 立即回報目前長度（可能已有草稿）
  }

  const existing = getReviewTextarea()
  if (existing) {
    attach(existing)
    return () => textarea?.removeEventListener('input', handler)
  }

  // 還沒 render：用 MutationObserver 等 textarea 出現，逾時放棄
  let done = false
  const observer = new MutationObserver(() => {
    const el = getReviewTextarea()
    if (el && !done) {
      done = true
      cleanup()
      attach(el)
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  const timer = setTimeout(() => {
    done = true
    cleanup()
  }, timeoutMs)

  function cleanup() {
    observer.disconnect()
    clearTimeout(timer)
  }

  return () => {
    done = true
    cleanup()
    textarea?.removeEventListener('input', handler)
  }
}

// 把潤飾結果寫回輸入框。KKday 是 Nuxt(Vue) app，輸入框可能受框架控制，
// 直接改 .value 框架不會察覺 → 用原生 setter 寫入再派發 input/change 事件，
// 讓框架的雙向綁定同步（否則使用者送出時送的還是舊值）。
export function writeReviewDraft(text: string): boolean {
  const el = getReviewTextarea()
  if (!el) return false

  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  if (setter) setter.call(el, text)
  else el.value = text

  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}
