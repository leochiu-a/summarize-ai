// Summarize AI Buddy — content script 進入點
// 1) 右下角 pixel 小夥伴（全站，點擊摘要整頁）
// 2) 商品頁專屬：在「商品說明」下方注入 AI 摘要卡片 → 見 productPageSummary.ts
// 3) 商品頁專屬：評論區「翻譯所有評論」按鈕 → 見 productPageReviews.ts
//
// 這個檔案是三者的唯一編排者，負責兩件橫向的事：
// - **開關**：popup 的總開關關閉、或這一頁被「在這頁停用」時，什麼都不注入；已注入的就地拆掉，
//   頁面上留不下痕跡（見 lib/pageScope.ts）。popup 一存檔就生效，不必重新整理。
// - **SPA 路由**：KKday 是 Nuxt SPA，站內導航不整頁重載。路由監聽集中在這裡（先全部拆掉再重新
//   判斷），注入模組自己不再各掛一份 —— 少 patch 幾次 history API，拆除順序也才是確定的。

import { createRoot, type Root } from 'react-dom/client'
import overlayScrollbarsStyles from 'overlayscrollbars/overlayscrollbars.css?inline'
import { Buddy } from './Buddy'
import { AVATAR_H, AVATAR_W, FRAMES } from './constants'
import styles from './content.css?inline'
import { refreshGeminiNano } from './lib/modelGate'
import { isBuddyEnabledHere } from './lib/pageScope'
import { onRouteChange } from './lib/productPage'
import { publishScope } from './lib/scopeSignal'
import { getSettings, onSettingsChanged } from './lib/settings'
import { startProductPageReviews, stopProductPageReviews } from './productPageReviews'
import { startProductPageSummary, stopProductPageSummary } from './productPageSummary'

const BUDDY_HOST_ID = 'summarize-ai-buddy-host'

// 小夥伴的 React root（關掉 / 換頁時 unmount）
let buddyRoot: Root | null = null

/**====================== 小夥伴（全站）======================*/
/**
 * 掛上右下角小夥伴：獨立 Shadow DOM host，樣式與宿主頁面互不干擾（冪等）
 */
function mountBuddy(): void {
  if (buddyRoot) return

  const host = document.createElement('div')
  host.id = BUDDY_HOST_ID
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
  buddyRoot = createRoot(mount)
  buddyRoot.render(<Buddy />)
}

/**
 * 拆掉小夥伴（連 Shadow host 一起移除，頁面上不留節點）
 */
function unmountBuddy(): void {
  buddyRoot?.unmount()
  buddyRoot = null
  document.getElementById(BUDDY_HOST_ID)?.remove()
}

/**====================== 開關編排 ======================*/
/**
 * 注入所有該注入的（各自冪等；非對應頁面自動 no-op）
 */
function mountAll(): void {
  mountBuddy()
  startProductPageSummary()
  startProductPageReviews()
}

/**
 * 拆掉所有注入的 UI
 */
function unmountAll(): void {
  unmountBuddy()
  stopProductPageSummary()
  stopProductPageReviews()
}

/**
 * 依「當前設定 + 當前網址」決定注入或拆除。設定變更、SPA 換頁後都重跑。
 * 同時把結論公布給 MAIN world 的 webmcp.js（它讀不到 chrome.storage，見 lib/scopeSignal.ts）。
 */
function applyScope(): void {
  const active = isBuddyEnabledHere()
  if (active) mountAll()
  else unmountAll()
  publishScope(active)
}

/**====================== 啟動 ======================*/
// 設定先補水，之後 isBuddyEnabledHere() 都能同步判斷（停用頁不會先閃一下小夥伴才消失）。
const settingsReady = getSettings()

// 第一階段：設定一到就先決定小夥伴要不要出現。刻意不等 Gemini Nano 探測——探測慢的機器
// 不該連小夥伴都看不到（模型未就緒時 Buddy 內部自己會擋在 ConsentBuddy）。
void settingsReady.then(() => {
  if (isBuddyEnabledHere()) mountBuddy()
})

// 第二階段：Gemini Nano consent gate 校正一次可用狀態，填好同步快取。
// 注入層（商品摘要卡片）會用同步快取決定「建立 UI 之前」要不要顯示（零閃現），
// 所以要等校正完才啟動商品頁注入功能，確保它們讀得到快取。
void Promise.allSettled([settingsReady, refreshGeminiNano()]).then(() => {
  applyScope()

  // popup 存檔（總開關、停用清單）即時生效，不必重新整理
  onSettingsChanged(applyScope)

  // SPA 站內導航：先全部拆掉再重新判斷（換到新商品頁要重跑，換到停用頁就不再注入）
  onRouteChange(() => {
    unmountAll()
    applyScope()
  })
})
