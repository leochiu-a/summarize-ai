// Gemini Nano 模型「同意才下載」關卡（consent gate）。
//
// 這個 extension 的 A 組功能（整頁摘要 Summarizer、商品摘要/值不值得 LanguageModel、
// 評論潤飾 Rewriter）底層共用同一顆 Gemini Nano，下載一次、跨 origin 共用。首次使用
// 需要下載一段時間、體積不小，所以要先問使用者同意才下載，而不是偷偷觸發。
//
// 這個模組是 A 組的共用 gate：
// - 用「無選項的 LanguageModel.availability()」當 base-model probe（只決定「要不要問同意」）。
//   注意：availability() 是「以 create options 為單位」回報的，帶 outputLanguage 等選項可能各自
//   需要額外資料 → 各 UI 實際生成時仍走自己的 create path，這裡只代表 base model 就緒與否。
// - 提供同步快取，讓注入層在「建立 UI 之前」就能決定顯不顯示（零閃現）。
// - 下載完成後廣播，讓同頁已隱藏的 UI 就地復活，不必重新整理。
//
// B 組（Translator / LanguageDetector）是獨立模型 + 語言包，不歸這裡管（見 reviewTranslate.ts）。
//
// Availability 型別直接用 @types/dom-chromium-ai 的全域 ambient 宣告（tsconfig types 已引入），
// 不自己再宣告一份。

// 模組級同步快取：最近一次 availability 校正結果。null = 還沒校正過（冷啟動）。
let cached: Availability | null = null

type Listener = (availability: Availability) => void
const listeners = new Set<Listener>()

// 下載的 in-flight promise（單例去重）：多個進入點同時要下載時，只跑一次 create。
let downloadPromise: Promise<void> | null = null

/**
 * 同步讀取快取的 Gemini Nano 可用狀態，給注入層決定「建立 UI 之前」要不要顯示。
 * 冷啟動（還沒 refresh 過）回 null，呼叫端應視為「先不顯示」並等 refresh 校正。
 */
export function geminiNanoAvailabilitySync(): Availability | null {
  return cached
}

/**
 * 非同步校正 Gemini Nano 狀態並更新快取；狀態有變動時通知 listeners。
 * 用無選項的 LanguageModel.availability() 當 base-model probe。不支援 API 一律 unavailable。
 */
export async function refreshGeminiNano(): Promise<Availability> {
  const next = await probeAvailability()
  const changed = next !== cached
  cached = next
  if (changed) for (const cb of listeners) cb(next)
  return next
}

async function probeAvailability(): Promise<Availability> {
  if (typeof LanguageModel === 'undefined') return 'unavailable'
  try {
    return await LanguageModel.availability()
  } catch {
    return 'unavailable'
  }
}

/**
 * 使用者同意後觸發下載（必須在使用者手勢內呼叫）。用 in-flight promise 去重，
 * 避免多個進入點同時 create 兩個下載。下載透過 LanguageModel.create 的 monitor 回報進度；
 * 建好的 session 只為了觸發下載，立即 destroy（base weights 已留在 profile）。
 * 下載完成後校正快取並廣播，讓同頁 UI 就地復活。
 * @param onProgress 下載進度（0~1）
 */
export function downloadGeminiNano(onProgress?: (loaded: number) => void): Promise<void> {
  if (downloadPromise) return downloadPromise

  downloadPromise = (async () => {
    if (typeof LanguageModel === 'undefined') {
      throw new Error('這個瀏覽器不支援內建 AI 模型（需要 Chrome 138+，且裝置符合硬體需求）。')
    }
    let session: LanguageModel | null = null
    try {
      session = await LanguageModel.create({
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => onProgress?.(e.loaded))
        },
      })
    } finally {
      session?.destroy()
    }
    // 下載完成：校正快取（應為 available）並廣播給同頁其他 UI
    await refreshGeminiNano()
  })()

  // 不論成敗都清掉 in-flight，讓失敗後能重試
  downloadPromise.finally(() => {
    downloadPromise = null
  })

  return downloadPromise
}

/**
 * 訂閱 gate 狀態變化（主要用途：下載完成後，讓同頁已隱藏的 UI 就地復活）。
 * @returns 解除訂閱函式
 */
export function onGateChange(cb: Listener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

// 測試用：重設模組級狀態
export function resetGateForTest(): void {
  cached = null
  downloadPromise = null
  listeners.clear()
}

// 測試用：直接設定同步快取（讓 gate 的同步初值可控，不必真的呼叫 availability）
export function setGateAvailabilityForTest(a: Availability): void {
  cached = a
}
