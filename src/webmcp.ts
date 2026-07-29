// WebMCP 註冊層進入點 —— 在 **MAIN world** 執行的 content script。
//
// 為什麼要另一支 content script：`document.modelContext` 是 page world 的物件。原本的
// content.js 跑在 MV3 預設的 ISOLATED world，那裡有自己的一份 `document` wrapper，
// 看不到頁面的 modelContext。所以 manifest 另外註冊一筆 `"world": "MAIN"` 的 entry。
// 代價：MAIN world 拿不到 `chrome.*`，因此本檔只能 import 不碰 chrome API 的 lib 模組
// （productFacts / productPage / reviewPage / reviewTranslate / packageAvailability 都符合），
// 不能用 settings.ts 與三個 cache 模組。
//
// ⚠️ 定位要說清楚：WebMCP 是**給網站作者用的 API**。這支 script 是用擴充套件在 kkday.com
// 上「代替網站」註冊 tool，目的是在真的動 Nuxt 之前，先驗證 tool 的粒度、schema 與輸出
// 大小是否對 agent 好用。它是提案原型，不是上線路徑 —— 正式做法是把同一組 tool 定義
// 搬進 KKday 自己的前端，直接接既有的 client-side 邏輯與 server 事實。

import { toolsForCurrentPage } from './lib/webmcpTools'
import { onRouteChange } from './lib/productPage'
import type { ModelContext } from './webmcp/modelContext'

const LOG = '[summarize-ai/webmcp]'

/**
 * 取得 modelContext。兩個位置都要看：
 * spec PR #177（2026-05-19）把 `navigator.modelContext` 搬到 `document.modelContext`，
 * Chromium 150 起 deprecate 舊位置，但部分 origin trial build 上舊位置仍是唯一入口。
 */
export function getModelContext(): ModelContext | null {
  return document.modelContext ?? navigator.modelContext ?? null
}

let controller: AbortController | null = null

/**
 * 註冊目前頁面該有的 tool。
 * 現行 spec 已移除 unregisterTool()/clearContext()，註銷唯一手段是 abort 註冊時傳入的 signal。
 */
async function register(): Promise<void> {
  const mc = getModelContext()
  if (!mc) return

  controller?.abort() // 換頁：先把上一頁的 tool 全部拔掉
  const tools = toolsForCurrentPage()
  if (!tools.length) {
    controller = null
    return
  }

  controller = new AbortController()
  const { signal } = controller

  // 逐支 catch：一支失敗不該拖垮其他支。
  // NotAllowedError → 被 Permissions Policy `tools` 擋住（站方送了 tools=()，或在沒有
  //   allow="tools" 的 cross-origin iframe 裡）
  // InvalidStateError → 同名重複註冊 / name 或 description 為空 / name 含非法字元
  const results = await Promise.all(
    tools.map((tool) =>
      mc.registerTool(tool, { signal }).then(
        () => tool.name,
        (err: DOMException) => {
          console.warn(`${LOG} registerTool("${tool.name}") failed:`, err.name, err.message)
          return null
        },
      ),
    ),
  )
  const ok = results.filter((n): n is string => n !== null)
  if (ok.length) console.info(`${LOG} registered ${ok.join(', ')}`)
}

export function startWebMcp(): void {
  const mc = getModelContext()
  if (!mc) {
    // 沒有 WebMCP 的三種常見原因，一次講完，省得逐一猜：
    console.info(
      `${LOG} modelContext unavailable. Chrome 149+ 需開 chrome://flags/#enable-webmcp-testing ` +
        `或 --enable-features=WebMCP；另外若站方送了 Origin-Agent-Cluster: ?0，整個 API 會被靜默停用。`,
    )
    return
  }

  void register()
  // Nuxt SPA 站內導航不整頁重載 → 路由變了要重新決定該註冊哪些 tool
  onRouteChange(() => void register())
}

startWebMcp()
