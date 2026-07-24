// Summarize AI Buddy — content script 進入點
// 1) 右下角 pixel 小夥伴（點擊摘要整頁）
// 2) product page 進來時，自動在「商品說明」下方注入結構化摘要卡片

import { createRoot, type Root } from 'react-dom/client'
import { Buddy } from './Buddy'
import { ProductSummaryCard } from './components/ProductSummaryCard'
import {
  PRODUCT_SUMMARY_HOST_ID,
  findDescSection,
  findDescTitle,
  isProductPage,
  onRouteChange,
  waitForDescSection,
} from './lib/productPage'
import { productSummaryStyles } from './productSummaryStyles'
import { styles } from './styles'

// ── 小夥伴（整頁摘要）──────────────────────────────────────────
const host = document.createElement('div')
host.id = 'summarize-ai-buddy-host'
const shadow = host.attachShadow({ mode: 'open' })

const styleEl = document.createElement('style')
styleEl.textContent = styles
shadow.appendChild(styleEl)

const mount = document.createElement('div')
shadow.appendChild(mount)

document.documentElement.appendChild(host)
createRoot(mount).render(<Buddy />)

// ── 商品說明摘要卡片 ──────────────────────────────────────────
let productRoot: Root | null = null
let sectionObserver: MutationObserver | null = null
let cancelWait: (() => void) | null = null

function debounce(fn: () => void, ms: number): () => void {
  let t: ReturnType<typeof setTimeout> | undefined
  return () => {
    clearTimeout(t)
    t = setTimeout(fn, ms)
  }
}

// 建立獨立 Shadow DOM host，插在「商品說明」標題正下方，掛載卡片。
function injectCard(section: HTMLElement) {
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
  productRoot.render(<ProductSummaryCard />)
}

// 目前若該有卡片卻不在（Nuxt re-render 洗掉），重新注入
function ensureCard() {
  if (!isProductPage() || document.getElementById(PRODUCT_SUMMARY_HOST_ID)) return
  const section = findDescSection()
  if (section) injectCard(section)
}

function unmountProductSummary() {
  cancelWait?.()
  cancelWait = null
  sectionObserver?.disconnect()
  sectionObserver = null
  productRoot?.unmount()
  productRoot = null
  document.getElementById(PRODUCT_SUMMARY_HOST_ID)?.remove()
}

function bootstrapProductSummary() {
  if (!isProductPage()) return
  cancelWait = waitForDescSection((section) => {
    injectCard(section)
    // 守住被框架 re-render 洗掉的情況（debounce 合併大量 SPA mutation）
    sectionObserver = new MutationObserver(debounce(ensureCard, 300))
    sectionObserver.observe(section.parentElement ?? document.body, {
      childList: true,
      subtree: true,
    })
  })
}

// SPA 站內導航：拆掉舊卡片，對新頁重跑（非商品頁自動 no-op）
onRouteChange(() => {
  unmountProductSummary()
  bootstrapProductSummary()
})

bootstrapProductSummary()
