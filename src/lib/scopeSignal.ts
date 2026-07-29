// 跨 world 的「小夥伴在這一頁是啟用的嗎」訊號。
//
// 為什麼需要這個：開關存在 chrome.storage，只有 ISOLATED world 的 content.js 讀得到；
// 但 webmcp.js 跑在 MAIN world（`document.modelContext` 是 page world 的物件），那裡沒有
// `chrome.*`（見 webmcp.ts 開頭的說明）。兩個 world 唯一共用的東西是 DOM，所以用
// `<html>` 上的一個標記屬性當訊號：content.js 寫，webmcp.js 讀 + 用 MutationObserver 訂閱。
//
// 語意刻意做成「有屬性 = 啟用」而不是 `="0" / "1"`：停用時屬性整個移除，頁面上不留任何痕跡
// （符合總開關關閉時「看不到 extension 痕跡」的要求）。代價是 MAIN world 分不出「停用」與
// 「content.js 還沒公布」，兩者都當成停用 —— 這正是我們要的保守方向（fail closed：
// 寧可晚一點註冊 tool，也不要在使用者關掉的情況下註冊）。
//
// 這個模組不碰 chrome API，MAIN world 也 import 得起。

const SCOPE_ATTR = 'data-summarize-ai'

/**
 * 公布當前頁面的啟用狀態（只有 ISOLATED world 的 content.js 該呼叫）
 * @param active 小夥伴是否在這一頁運作
 */
export function publishScope(active: boolean): void {
  if (active) document.documentElement.setAttribute(SCOPE_ATTR, '')
  else document.documentElement.removeAttribute(SCOPE_ATTR)
}

/**
 * 讀當前頁面的啟用狀態。屬性不存在代表「停用」或「還沒公布」，一律回 false。
 */
export function isScopeActive(): boolean {
  return document.documentElement.hasAttribute(SCOPE_ATTR)
}

/**
 * 訂閱啟用狀態變化（MAIN world 用來跟著註冊 / 註銷 tool）。
 * 只在狀態真的翻轉時回呼，避免同值重複觸發。
 * @param cb 收到新狀態
 * @returns 解除訂閱函式
 */
export function onScopeChange(cb: (active: boolean) => void): () => void {
  let last = isScopeActive()
  const observer = new MutationObserver(() => {
    const next = isScopeActive()
    if (next === last) return
    last = next
    cb(next)
  })
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [SCOPE_ATTR],
  })
  return () => observer.disconnect()
}
