// 商品頁專屬功能：在 KKday 商品頁「Reviews / 評論」標題下方注入「翻譯所有評論」按鈕。
// 只在 /product/<id> 生效。點按鈕用 Chrome 內建 Translator 就地把非本地語言的評論翻好。
//
// 相較商品說明摘要卡片（見 productPageSummary.ts），評論區是 SSR-stable、hydration 風波小，
// 這裡不做探針等 hydration，只保留一個守衛 observer：按鈕被之後的 re-render 洗掉時重插。

import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ReviewTranslateButton } from './components/ReviewTranslateButton'
import {
  REVIEW_TRANSLATE_HOST_ID,
  findReviewButtonAnchor,
  findReviewSection,
  isProductPage,
  onRouteChange,
  waitForReviewSection,
} from './lib/productPage'
import { TRANSLATION_NODE_ATTR } from './lib/reviewTranslate'
import reviewTranslateStyles from './reviewTranslate.css?inline'

// 譯文節點是就地插進 KKday 的 light DOM（非 shadow），需要一份 global style 才吃得到樣式。
// 只注入一次；用 id 去重。
const INJECTED_STYLE_ID = 'summarize-ai-review-translate-style'
function ensureGlobalTranslationStyle(): void {
  if (document.getElementById(INJECTED_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = INJECTED_STYLE_ID
  // 譯文區塊：與原文用一條淡青分隔線區隔，字級固定 14px、標題略粗，一眼看出是翻譯。
  style.textContent = `
[${TRANSLATION_NODE_ATTR}] {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #b8ecf3;
  color: #4a5a60;
  font-size: 14px;
  line-height: 1.7;
}
[${TRANSLATION_NODE_ATTR}] [data-summarize-ai-translation-title] {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 2px;
}
`
  document.head.appendChild(style)
}

/**====================== 生命週期狀態 ======================*/
let buttonRoot: Root | null = null
let sectionObserver: MutationObserver | null = null
let cancelWait: (() => void) | null = null

/**====================== 工具 ======================*/
function debounce(fn: () => void, ms: number): () => void {
  let t: ReturnType<typeof setTimeout> | undefined
  return () => {
    clearTimeout(t)
    t = setTimeout(fn, ms)
  }
}

/**====================== 注入 ======================*/
/**
 * 建立獨立 Shadow DOM host，插在「評論列表正上方」（評分之後），掛載按鈕（冪等）
 * @param section 評論區塊
 */
function injectButton(section: HTMLElement): void {
  if (document.getElementById(REVIEW_TRANSLATE_HOST_ID)) return // 冪等：已存在不重插

  const anchor = findReviewButtonAnchor(section)
  if (!anchor) return

  const host = document.createElement('div')
  host.id = REVIEW_TRANSLATE_HOST_ID
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = reviewTranslateStyles
  shadow.appendChild(style)
  const mount = document.createElement('div')
  shadow.appendChild(mount)

  // 放在評論列表前面（評分之後）：不切斷「標題→評分」，又緊貼它要作用的評論
  if (anchor.position === 'before') anchor.node.before(host)
  else anchor.node.after(host)

  buttonRoot = createRoot(mount)
  buttonRoot.render(createElement(ReviewTranslateButton))
}

/**
 * 守衛：該有按鈕卻不在（被 Nuxt re-render 洗掉）時重新注入。
 */
function ensureButton(): void {
  if (!isProductPage() || document.getElementById(REVIEW_TRANSLATE_HOST_ID)) return
  const section = findReviewSection()
  if (section) injectButton(section)
}

/**====================== 生命週期 ======================*/
function unmountReviewTranslate(): void {
  cancelWait?.()
  cancelWait = null
  sectionObserver?.disconnect()
  sectionObserver = null
  buttonRoot?.unmount()
  buttonRoot = null
  document.getElementById(REVIEW_TRANSLATE_HOST_ID)?.remove()
}

function bootstrapReviewTranslate(): void {
  if (!isProductPage()) return
  ensureGlobalTranslationStyle()
  cancelWait = waitForReviewSection((section) => {
    injectButton(section)
    // 守住之後被框架 re-render 洗掉的情況（debounce 合併大量 SPA mutation）
    sectionObserver = new MutationObserver(debounce(ensureButton, 300))
    sectionObserver.observe(section.parentElement ?? document.body, {
      childList: true,
      subtree: true,
    })
  })
}

/**====================== 進入點 ======================*/
/**
 * 啟動商品頁評論翻譯功能：首次執行 + 監聽 SPA 站內導航重跑。非商品頁自動 no-op。
 */
export function startProductPageReviews(): void {
  onRouteChange(() => {
    unmountReviewTranslate()
    bootstrapReviewTranslate()
  })

  bootstrapReviewTranslate()
}
