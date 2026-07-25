// 商品頁專屬功能：在 KKday 商品頁「商品說明」下方注入 AI 商品重點摘要卡片。
// 只在 /product/<id> 生效（全站的小夥伴不在這裡，見 content.tsx）。
//
// 難點：商品說明整條是 defineAsyncComponent，SSR 先有 HTML、client chunk 晚一步才 hydrate。
// 若搶在 hydrate 前注入卡片，會觸發 hydration mismatch，Vue 重繪 #product-info-sec 的
// children、把卡片洗掉（就是「出現 → 消失 → 出現」的來源）。
// 解法：先塞隱形探針，探針被 Vue 洗掉 = 這塊 hydrate 完成，這時才注入卡片；
// hydrate 之後那塊資料是 SSR-stable、不會再重繪，卡片就穩了。

import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ProductSummaryCard } from './components/ProductSummaryCard'
import { geminiNanoAvailabilitySync, onGateChange } from './lib/modelGate'
import {
  PRODUCT_SUMMARY_HOST_ID,
  findDescSection,
  findDescTitle,
  isProductPage,
  onRouteChange,
  waitForDescSection,
} from './lib/productPage'
import productSummaryStyles from './productSummary.css?inline'

// 探針等 hydration 的保險逾時：探針一直沒被洗掉（已 hydrate 或該頁不重繪）也直接注入
const HYDRATION_WAIT_TIMEOUT_MS = 6000

/**====================== 生命週期狀態 ======================*/
// 卡片的 React root（拆頁時 unmount）
let productRoot: Root | null = null
// 守衛 observer：卡片被之後的 re-render 洗掉時重新注入
let sectionObserver: MutationObserver | null = null
// 等商品說明區塊出現的解除函式
let cancelWait: (() => void) | null = null
// 等該區塊 hydrate 完成的解除函式
let cancelHydrationWait: (() => void) | null = null
// 首次「hydration 安全注入」是否已完成；完成前不讓守衛 observer 搶著注入（會被 mismatch 洗掉）
let hydrationSettled = false
// 等 Gemini Nano 下載完成廣播的解除函式（gate 未就緒時訂閱，就緒後重跑 bootstrap）
let cancelGateWait: (() => void) | null = null

/**====================== 工具 ======================*/
/**
 * debounce：合併短時間內大量呼叫，只在安靜 ms 後執行一次
 * @param fn 目標函式
 * @param ms 安靜時間（毫秒）
 */
function debounce(fn: () => void, ms: number): () => void {
  let t: ReturnType<typeof setTimeout> | undefined
  return () => {
    clearTimeout(t)
    t = setTimeout(fn, ms)
  }
}

/**====================== 注入 ======================*/
/**
 * 建立獨立 Shadow DOM host，插在「商品說明」標題正下方，掛載卡片（冪等）
 * @param section 商品說明區塊
 */
function injectCard(section: HTMLElement): void {
  if (document.getElementById(PRODUCT_SUMMARY_HOST_ID)) return // 冪等：已存在不重插

  const cardHost = document.createElement('div')
  cardHost.id = PRODUCT_SUMMARY_HOST_ID
  const cardShadow = cardHost.attachShadow({ mode: 'open' })
  const cardStyle = document.createElement('style')
  cardStyle.textContent = productSummaryStyles
  cardShadow.appendChild(cardStyle)
  const cardMount = document.createElement('div')
  cardShadow.appendChild(cardMount)

  const title = findDescTitle(section)
  if (title) title.after(cardHost)
  else section.prepend(cardHost)

  productRoot = createRoot(cardMount)
  productRoot.render(createElement(ProductSummaryCard))
}

/**
 * 等商品說明區塊 hydrate 完成後再注入卡片，避免 hydration mismatch 把卡片洗掉。
 * 先塞隱形探針，探針被 Vue 洗掉即代表這塊 hydrate 完成；逾時（已 hydrate/不重繪）也直接注入。
 * @param section 商品說明區塊
 * @returns 解除函式（SPA 導航中途取消用）
 */
function injectAfterHydration(section: HTMLElement): () => void {
  // 已有卡片（SPA 冪等）就不用等
  if (document.getElementById(PRODUCT_SUMMARY_HOST_ID)) {
    hydrationSettled = true
    return () => {}
  }

  const probe = document.createElement('div')
  probe.style.display = 'none'
  probe.setAttribute('data-summarize-ai-probe', '')
  section.appendChild(probe)

  let settled = false
  const finish = () => {
    if (settled) return
    settled = true
    cleanup()
    probe.remove()
    hydrationSettled = true
    const target = findDescSection()
    if (target) injectCard(target)
  }

  // 探針被 Vue 洗掉 = 這塊剛 hydrate 完，此刻注入的卡片才不會被 mismatch 重繪清掉。
  // 觀察穩定祖先（section 本身有可能整顆被換掉），只認「探針已離開 DOM」這個訊號。
  const observer = new MutationObserver(() => {
    if (!probe.isConnected) finish()
  })
  observer.observe(section.parentElement ?? document.documentElement, {
    childList: true,
    subtree: true,
  })

  // 保險：探針一直沒被洗掉（該區塊在 content script 執行前就已 hydrate，或這頁不會重繪），
  // 逾時仍直接注入，避免卡片永遠不出現
  const timer = setTimeout(finish, HYDRATION_WAIT_TIMEOUT_MS)

  function cleanup(): void {
    observer.disconnect()
    clearTimeout(timer)
  }

  return () => {
    settled = true
    cleanup()
    probe.remove()
  }
}

/**
 * 守衛：該有卡片卻不在（之後被 Nuxt re-render 洗掉）時重新注入。
 * 首次 hydration 安全注入完成前不出手，交給 injectAfterHydration。
 */
function ensureCard(): void {
  if (!hydrationSettled) return
  if (!isProductPage() || document.getElementById(PRODUCT_SUMMARY_HOST_ID)) return
  const section = findDescSection()
  if (section) injectCard(section)
}

/**====================== 生命週期 ======================*/
/**
 * 拆掉卡片與所有監聽、重設狀態（SPA 換頁前呼叫）
 */
function unmountProductSummary(): void {
  cancelWait?.()
  cancelWait = null
  cancelHydrationWait?.()
  cancelHydrationWait = null
  cancelGateWait?.()
  cancelGateWait = null
  hydrationSettled = false
  sectionObserver?.disconnect()
  sectionObserver = null
  productRoot?.unmount()
  productRoot = null
  document.getElementById(PRODUCT_SUMMARY_HOST_ID)?.remove()
}

/**
 * 對當前頁面啟動摘要卡片（非商品頁自動 no-op）。
 * gate：Gemini Nano 未就緒時完全不注入（連 hydration 探針都不塞），改訂閱下載完成廣播，
 * 就緒後才重跑 bootstrap → 使用者同意下載完成即可就地看到卡片，不必重新整理。
 */
function bootstrapProductSummary(): void {
  if (!isProductPage()) return

  // Gemini Nano 未就緒：不注入，等下載完成廣播（available）再重跑一次
  if (geminiNanoAvailabilitySync() !== 'available') {
    cancelGateWait?.()
    cancelGateWait = onGateChange((a) => {
      if (a !== 'available') return
      cancelGateWait?.()
      cancelGateWait = null
      bootstrapProductSummary()
    })
    return
  }

  cancelWait = waitForDescSection((section) => {
    // 等該區塊 hydrate 完成再注入，避免 hydration mismatch 把卡片洗掉
    cancelHydrationWait = injectAfterHydration(section)
    // 守住之後被框架 re-render 洗掉的情況（debounce 合併大量 SPA mutation）
    sectionObserver = new MutationObserver(debounce(ensureCard, 300))
    sectionObserver.observe(section.parentElement ?? document.body, {
      childList: true,
      subtree: true,
    })
  })
}

/**====================== 進入點 ======================*/
/**
 * 啟動商品頁 AI 摘要功能：首次執行 + 監聽 SPA 站內導航重跑。非商品頁自動 no-op。
 */
export function startProductPageSummary(): void {
  // SPA 站內導航：拆掉舊卡片，對新頁重跑
  onRouteChange(() => {
    unmountProductSummary()
    bootstrapProductSummary()
  })

  bootstrapProductSummary()
}
