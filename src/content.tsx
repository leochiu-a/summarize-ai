// Summarize AI Buddy — content script 進入點
// 1) 右下角 pixel 小夥伴（全站，點擊摘要整頁）
// 2) 商品頁專屬：在「商品說明」下方注入 AI 摘要卡片 → 見 productPageSummary.tsx

import { createRoot } from 'react-dom/client'
import overlayScrollbarsStyles from 'overlayscrollbars/overlayscrollbars.css?inline'
import { Buddy } from './Buddy'
import { AVATAR_H, AVATAR_W, FRAMES } from './constants'
import styles from './content.css?inline'
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

// ── 商品頁專屬：AI 商品重點摘要卡片 ──────────────────────────────
startProductPageSummary()
