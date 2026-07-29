// 「預熱一份 AI session」的共用容器（warm slot）。
//
// 為什麼要預熱：Chrome 內建 AI 的 create() 要把模型載進記憶體，第一次呼叫的 cold start
// 不算短。如果等到使用者按下「開始」才 create，這段時間全算在他的等待裡。
// 依 Chrome 官方建議（https://developer.chrome.com/docs/ai/built-in-ai-dos-donts
// 〈Prepare the model at a reasonable time〉），在「使用者意圖已經明確」的時刻——展開泡泡、
// 卡片出現在眼前——就先默默 create，把 cold start 藏在他讀提示文字的那幾秒。
//
// 這個模組只管 session 的生命週期，不管是哪一種 API：
// - warm(key)：冪等。同 key 重複呼叫沿用同一個 in-flight / 已建好的實例。
// - take(key)：取用。命中預熱＝零等待；key 不同（使用者改了語氣等設定）先收掉舊的再建新的。
// - release()：destroy 並清空（對應官方〈Destroy unused sessions〉）。
//
// 每個功能各自建一個 slot 實例：商品摘要卡片與「值不值得買」都用 LanguageModel，但跑在
// 同一個 content script context，共用一個 slot 會互相把對方的 session 收掉。

export interface WarmSlot<T> {
  /** 預熱：把 session 建起來放著。同 key 重複呼叫只會建一次。 */
  warm(key: string): Promise<T>
  /** 取用：命中預熱直接回；key 不同則收掉舊的重建。 */
  take(key: string): Promise<T>
  /** 收掉目前持有的 session（in-flight 中的也會在建好後立刻收掉）。 */
  release(): void
}

/**
 * 建立一個 warm slot。
 * @param create 依 key 建立 session 的函式（key 的語意由呼叫端決定，例如語氣或 create 選項的 JSON）
 */
export function createWarmSlot<T extends { destroy(): unknown }>(
  create: (key: string) => Promise<T>,
): WarmSlot<T> {
  // 目前持有的 slot。promise 而非實例：預熱還沒建好時就有人 take，兩邊要等到同一個 create。
  let held: { key: string; promise: Promise<T> } | null = null

  function release(): void {
    const current = held
    held = null
    // 還在建的也要收：等它建好再 destroy，別讓一個沒人要的 session 留在記憶體裡
    current?.promise.then((s) => s.destroy()).catch(() => {})
  }

  function warm(key: string): Promise<T> {
    if (held?.key === key) return held.promise

    // key 變了（設定改過）：舊的用不上了，先收掉
    release()

    // 包一層 async：create 同步 throw（例如 API 根本不存在）也一律變成 rejected promise，
    // 呼叫端才能統一用 .catch() 吞掉預熱失敗
    const promise = (async () => await create(key))()
    held = { key, promise }

    // 失敗就清掉，讓下一次 warm / take 能重試（而不是永遠拿到同一個 rejected promise）
    promise.catch(() => {
      if (held?.promise === promise) held = null
    })

    return promise
  }

  // take 與 warm 同一條路徑：命中就沿用，沒命中就現場建（預熱只是提前，不是必要條件）
  return { warm, take: warm, release }
}
