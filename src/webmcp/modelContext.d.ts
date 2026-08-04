// WebMCP（Web Model Context Protocol）型別宣告。
//
// 為什麼要自己寫：@types/dom-chromium-ai 只涵蓋 built-in AI（LanguageModel / Summarizer /
// Translator…），不含 modelContext。WebMCP 目前是 W3C Web Machine Learning **Community Group
// Draft**（2026-07-21），不是 W3C 標準、也不在 standards track，還沒有官方 .d.ts。
//
// 以下欄位對齊 spec 的 IDL Index：https://webmachinelearning.github.io/webmcp/#idl-index
// 重要版本差異（2026-05-19 spec PR #177 起）：
//   - `document.modelContext` 是現行位置；`navigator.modelContext` 於 Chromium 150 deprecated
//   - `provideContext()` / `unregisterTool()` / `clearContext()` 都**已移除**
//     → 註銷改用 AbortController 傳 `{ signal }`
//   - `execute` 只有一個參數（沒有第二個 agent 參數）

/** tool 的行為提示。WebMCP 只有這兩個，沒有 backend MCP 的 destructiveHint / idempotentHint。 */
export interface ToolAnnotations {
  /** true = 只讀不改 state。agent 可據此決定要不要先問使用者。 */
  readOnlyHint?: boolean
  /** true = 輸出含第三方 / UGC 內容（評論、商家文案），agent 必須當不可信資料。 */
  untrustedContentHint?: boolean
}

export interface ModelContextTool {
  /** ≤128 字元，只允許 ASCII 英數 / `_` / `-` / `.`（Chrome 另建議 ≤30 字元） */
  name: string
  /** 給瀏覽器原生 UI 顯示，建議 localize */
  title?: string
  /** 說明「做什麼 + 何時該用」。Chrome 建議 ≤500 字元。 */
  description: string
  /**
   * JSON Schema。選填（無參數的 tool 可省略）。
   * Chrome 建議每個參數的 `description` ≤150 字元、參數名 ≤30 字元。
   */
  inputSchema?: object
  /** 回傳值型別是 any：純字串或小 JSON 都合法。Chrome 建議輸出 ≤1.5K 字元。 */
  execute: (input: Record<string, unknown>) => Promise<unknown>
  annotations?: ToolAnnotations
}

export interface ModelContextRegisterToolOptions {
  /** abort 即註銷此 tool——這是現行唯一的註銷手段 */
  signal?: AbortSignal
  /** 允許哪些 cross-origin document 透過 getTools({ fromOrigins }) 看到此 tool */
  exposedTo?: string[]
}

export interface RegisteredTool {
  name: string
  title?: string
  description: string
  /** ⚠️ 讀回來是 JSON **字串**，不是 object，要自己 JSON.parse */
  inputSchema?: string
  window: Window
  origin: string
  annotations?: ToolAnnotations
}

export interface ModelContext extends EventTarget {
  registerTool(tool: ModelContextTool, options?: ModelContextRegisterToolOptions): Promise<void>
  getTools(options?: { fromOrigins?: string[] }): Promise<RegisteredTool[]>
  /** spec 尚未定義、Chrome 已實作：args 是 JSON 字串；觸發導航時回傳 null */
  executeTool?(tool: RegisteredTool, jsonArgs: string, options?: { signal?: AbortSignal }): Promise<unknown>
  ontoolchange: ((this: ModelContext, ev: Event) => unknown) | null
}

declare global {
  interface Document {
    readonly modelContext?: ModelContext
  }
  interface Navigator {
    /** @deprecated Chromium 150 起 deprecated，僅為相容較舊的 origin trial build */
    readonly modelContext?: ModelContext
  }
}
