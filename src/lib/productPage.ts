// KKday product page 專用：頁面偵測、定位「商品說明」區塊、擷取內文、SPA 事件。
// KKday 是 Nuxt SPA，content script 在 document_idle 只跑一次；站內導航不整頁重載，
// 需要偵測路由變化重跑，也要等 SPA 首次 render 完成才抓得到區塊。

// 商品說明區塊在其它模組要注入卡片時的 sentinel（去重、擷取時排除自己）
export const PRODUCT_SUMMARY_HOST_ID = 'summarize-ai-product-summary-host'

// 商品說明內文截斷（Prompt API context window 有限，敘述通常 1~3k 字就夠）
const MAX_CHARS = 6000

// 商品頁 URL：/product/<id>（相容 /zh-tw/product/... 這種 locale 前綴）
const PRODUCT_PATH_RE = /\/product\/(\d+)/

export function isProductPage(): boolean {
  return PRODUCT_PATH_RE.test(location.pathname)
}

export function getProductId(): string | null {
  return location.pathname.match(PRODUCT_PATH_RE)?.[1] ?? null
}

// 定位商品說明容器。優先用相對穩定的 id，退回用標題文字反查外框，
// 不綁 Vue 的 data-v-* 或樣式 class（改版會變）。
export function findDescSection(): HTMLElement | null {
  const byId = document.querySelector<HTMLElement>('#product-info-sec')
  if (byId) return byId

  const title = [...document.querySelectorAll<HTMLElement>('h2.info-title, h2')].find((h) =>
    /商品說明/.test(h.textContent || ''),
  )
  return (title?.closest('.info-section') as HTMLElement) ?? null
}

// 商品說明標題節點（卡片要插在它後面）
export function findDescTitle(section: HTMLElement): HTMLElement | null {
  return section.querySelector<HTMLElement>('h2.info-title, h2')
}

// 擷取商品說明內文：clone 後移除雜訊與我們自己注入的卡片，去掉標題文字，取可見文字。
export function extractDescText(section: HTMLElement): string {
  const clone = section.cloneNode(true) as HTMLElement
  clone
    .querySelectorAll('script, style, noscript, svg, template, button, #' + PRODUCT_SUMMARY_HOST_ID)
    .forEach((el) => el.remove())
  // 移除標題本身（「商品說明」四個字對摘要沒意義）
  clone.querySelector('h2.info-title, h2')?.remove()

  const raw = clone.innerText || clone.textContent || ''
  return raw
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CHARS)
}

// 等商品說明區塊出現（SPA 首次 render 可能晚於 content script）。
// 已存在則同步回呼；否則 MutationObserver 觀察，逾時放棄。回傳解除函式。
export function waitForDescSection(
  cb: (section: HTMLElement) => void,
  timeoutMs = 15000,
): () => void {
  const existing = findDescSection()
  if (existing) {
    cb(existing)
    return () => {}
  }

  let done = false
  const finish = (section: HTMLElement) => {
    if (done) return
    done = true
    cleanup()
    cb(section)
  }

  const observer = new MutationObserver(() => {
    const section = findDescSection()
    if (section) finish(section)
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
  }
}

// 監聽 SPA 路由變化：patch history.pushState/replaceState + popstate。
// 只在 pathname 真的變動時觸發（忽略同頁 query/hash 抖動）。回傳解除函式。
export function onRouteChange(cb: () => void): () => void {
  let lastPath = location.pathname
  const notify = () => {
    if (location.pathname === lastPath) return
    lastPath = location.pathname
    cb()
  }

  const origPush = history.pushState
  const origReplace = history.replaceState
  history.pushState = function (...args) {
    origPush.apply(this, args as Parameters<typeof origPush>)
    notify()
  }
  history.replaceState = function (...args) {
    origReplace.apply(this, args as Parameters<typeof origReplace>)
    notify()
  }
  window.addEventListener('popstate', notify)

  return () => {
    history.pushState = origPush
    history.replaceState = origReplace
    window.removeEventListener('popstate', notify)
  }
}
