// Summarize AI Buddy — content script 進入點
// 1) 右下角 pixel 小夥伴（全站，點擊摘要整頁）
// 2) 商品頁專屬：在「商品說明」下方注入 AI 摘要卡片 → 見 productPageSummary.tsx

import { createRoot } from 'react-dom/client'
import { Buddy } from './Buddy'
import { startProductPageSummary } from './productPageSummary'
import { styles } from './styles'

// ── 小夥伴（全站，整頁摘要）──────────────────────────────────────
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

// ── 商品頁專屬：AI 商品重點摘要卡片 ──────────────────────────────
startProductPageSummary()
