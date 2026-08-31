// 評論撰寫頁專屬功能：在評論輸入框正下方注入一排 AI 按鈕（潤飾 / 開頭 / 擴寫 / 換語氣）。
// 只在 /order/comment/<訂單編號> 生效。這頁刻意不掛右下角的小夥伴（見 content.tsx）——
// 寫評論的人視線在輸入框，功能就該長在那裡。
//
// 這裡不做 Gemini Nano 的 gate：工具列自己處理（未就緒時顯示「啟用」按鈕，點擊即為下載手勢）。
// 商品頁那兩個功能是「模型沒就緒就整塊不注入」，因為它們沒有東西可以取代；
// 這頁不同——沒 AI 也還是要能寫評論，工具列存在但只佔一行，是刻意的。
//
// 但預熱不等 UI：一進到評論頁、gate 已放行就先把 baseline session 建起來，不等 textarea 出現、
// 也不等 React 掛載（那兩段等待對 cold start 完全沒有貢獻）。warm slot 是冪等的，工具列掛載後
// 再呼叫一次 prewarm 會拿到同一個 in-flight promise，不會重建。

import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ReviewToolbar } from './components/ReviewToolbar'
import { geminiNanoAvailabilitySync, onGateChange } from './lib/modelGate'
import { onRouteChange } from './lib/productPage'
import { prewarmReviewAssist, releaseReviewAssist } from './lib/reviewAssist'
import {
  REVIEW_TOOLBAR_HOST_ID,
  getReviewTextarea,
  isReviewPage,
  waitForReviewTextarea,
} from './lib/reviewPage'
import reviewToolbarStyles from './reviewToolbar.css?inline'

/**====================== 生命週期狀態 ======================*/
let toolbarRoot: Root | null = null
let guardObserver: MutationObserver | null = null
let cancelWait: (() => void) | null = null
// 等 gate 放行的解除函式（進頁時模型還沒就緒 → 訂閱廣播，下載完成就立刻預熱）
let cancelGateWait: (() => void) | null = null

function debounce(fn: () => void, ms: number): () => void {
  let t: ReturnType<typeof setTimeout> | undefined
  return () => {
    clearTimeout(t)
    t = setTimeout(fn, ms)
  }
}

/**====================== 注入 ======================*/
/**
 * 建立獨立 Shadow DOM host，插在評論輸入框正下方，掛載工具列（冪等）。
 * 錨點刻意用 textarea 自己，不用它外層的容器 class——容器是頁面的樣式細節，改版就掃到。
 */
function injectToolbar(textarea: HTMLTextAreaElement): void {
  if (document.getElementById(REVIEW_TOOLBAR_HOST_ID)) return // 冪等：已存在不重插

  const host = document.createElement('div')
  host.id = REVIEW_TOOLBAR_HOST_ID
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = reviewToolbarStyles
  shadow.appendChild(style)
  const mount = document.createElement('div')
  shadow.appendChild(mount)

  textarea.after(host)

  toolbarRoot = createRoot(mount)
  toolbarRoot.render(createElement(ReviewToolbar))
}

/**
 * 守衛：該有工具列卻不在（被頁面之後的 re-render 洗掉）時重新注入。
 */
function ensureToolbar(): void {
  if (!isReviewPage() || document.getElementById(REVIEW_TOOLBAR_HOST_ID)) return
  const textarea = getReviewTextarea()
  if (textarea) injectToolbar(textarea)
}

/**====================== 生命週期 ======================*/
function unmountToolbar(): void {
  cancelWait?.()
  cancelWait = null
  cancelGateWait?.()
  cancelGateWait = null
  guardObserver?.disconnect()
  guardObserver = null
  toolbarRoot?.unmount()
  toolbarRoot = null
  document.getElementById(REVIEW_TOOLBAR_HOST_ID)?.remove()
  // 工具列還沒掛載就離開這頁的話，元件的 cleanup 不會跑到，預熱的 session 得由這裡收
  releaseReviewAssist()
}

/**
 * 盡早預熱：進到評論頁、gate 已放行就先建 baseline session，把 cold start 藏進使用者打字的時間。
 * gate 未就緒時不硬做——那會在沒有使用者手勢的情況下觸發模型下載，是這個專案的紅線；
 * 改成訂閱 gate 廣播，使用者在工具列上同意並下載完成後，這裡就地補上預熱。
 */
function prewarmWhenAllowed(): void {
  if (geminiNanoAvailabilitySync() === 'available') {
    void prewarmReviewAssist().catch(() => {}) // 預熱是機會財，失敗留給按下按鈕時再報
    return
  }
  cancelGateWait = onGateChange((a) => {
    if (a !== 'available') return
    cancelGateWait?.()
    cancelGateWait = null
    void prewarmReviewAssist().catch(() => {})
  })
}

function bootstrapToolbar(): void {
  if (!isReviewPage()) return

  // 先預熱，再去等 textarea——順序反過來就等於白等 DOM 與 React 那兩段
  prewarmWhenAllowed()

  cancelWait = waitForReviewTextarea((textarea) => {
    injectToolbar(textarea)
    // 守住之後被頁面 re-render 洗掉的情況（debounce 合併大量 mutation）
    guardObserver = new MutationObserver(debounce(ensureToolbar, 300))
    guardObserver.observe(textarea.parentElement ?? document.body, {
      childList: true,
      subtree: true,
    })
  })
}

/**====================== 進入點 ======================*/
/**
 * 啟動評論頁 AI 工具列：首次執行 + 監聽站內導航重跑。非評論頁自動 no-op。
 */
export function startReviewPageToolbar(): void {
  onRouteChange(() => {
    unmountToolbar()
    bootstrapToolbar()
  })
  bootstrapToolbar()
}
