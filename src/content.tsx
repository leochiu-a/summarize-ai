// Summarize AI Buddy — content script 進入點
// 1) 右下角 pixel 小夥伴（全站，點擊摘要整頁）
// 2) 商品頁專屬：在「商品說明」下方注入 AI 摘要卡片 → 見 productPageSummary.tsx

import { createRoot } from 'react-dom/client'
import overlayScrollbarsStyles from 'overlayscrollbars/overlayscrollbars.css?inline'
import { Buddy } from './Buddy'
import { AVATAR_H, AVATAR_W, FRAMES } from './constants'
import styles from './content.css?inline'
import { refreshGeminiNano } from './lib/modelGate'
import { startProductPageReviews } from './productPageReviews'
import { startProductPageSummary } from './productPageSummary'

// ── 小夥伴（全站，整頁摘要）──────────────────────────────────────
const host = document.createElement('div')
host.id = 'summarize-ai-buddy-host'
const shadow = host.attachShadow({ mode: 'open' })

// 把 sprite 尺寸以 CSS 變數注入 :host，content.css 內用 var() 取用
const hostVars = `:host{--frames:${FRAMES};--avatar-w:${AVATAR_W}px;--avatar-h:${AVATAR_H}px}`

// OverlayScrollbars 的樣式也要注入 shadow root（浮層 scrollbar，不佔布局、不隨動畫閃）
const styleEl = document.createElement('style')
styleEl.textContent = hostVars + overlayScrollbarsStyles + styles
shadow.appendChild(styleEl)

const mount = document.createElement('div')
shadow.appendChild(mount)

document.documentElement.appendChild(host)
createRoot(mount).render(<Buddy />)

// ── Gemini Nano consent gate：先校正一次可用狀態，填好同步快取 ──────
// 注入層（商品摘要卡片）會用同步快取決定「建立 UI 之前」要不要顯示（零閃現）；
// Buddy 內部另有自己的 gate 流程。校正完再啟動商品頁注入功能，確保它們讀得到快取。
void refreshGeminiNano().finally(() => {
  // ── 商品頁專屬：AI 商品重點摘要卡片（gate 未就緒不注入，下載完成靠廣播就地復活）──
  startProductPageSummary()

  // ── 商品頁專屬：一鍵翻譯所有評論（B 組獨立判斷）────────────────
  startProductPageReviews()
})
