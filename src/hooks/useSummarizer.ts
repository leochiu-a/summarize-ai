import { useCallback, useEffect, useRef, useState } from 'react'
import type { BuddyPhase } from '../lib/buddyPhase'
import {
  extractContent,
  releaseSummarizer,
  takeSummarizer,
  warmSummarizer,
  type SummarizerOptions,
} from '../lib/summarizer'
import { getSettings, toneById, type Settings } from '../lib/settings'
import { getCachedSummary, setCachedSummary } from '../lib/summaryCache'

export interface Summarizing {
  phase: BuddyPhase
  markdown: string
  error: string
  fromCache: boolean
  prepare: () => Promise<void>
  summarize: (opts?: { force?: boolean }) => Promise<void>
  close: () => void
}

// 兩段式流程：
// - prepare()：使用者展開泡泡（意圖明確）→ 有快取直接給結果，沒快取就背景預熱 Summarizer。
// - summarize()：使用者按下按鈕才真的跑。availability →（unavailable 報錯）→ 擷取內容 →
//   查快取 →（未命中）串流摘要 → 寫快取。force=true 略過快取、強制重跑（重做按鈕用）。
//
// 為什麼這裡仍要判 availability，其他功能 hook 卻拿掉了：
// consent gate 用 LanguageModel（Prompt API）當 base-model probe。Summarizer 雖共用同一顆
// Gemini Nano，但 create 帶了 outputLanguage（見 lib/summarizer 的 createSummarizer），可能需要
// 額外的語言 adapter——availability 是 per-options 回報的，base model ready 不代表這組語言選項
// 就緒。所以 Summarizer 得自己確認。downloadable 時直接讓 create 去補 adapter（使用者已在 gate
// 同意過下載）；只有 unavailable（裝置不支援）才擋下報錯。
export function useSummarizer(): Summarizing {
  const [phase, setPhase] = useState<BuddyPhase>('idle')
  const [markdown, setMarkdown] = useState('')
  const [error, setError] = useState('')
  const [fromCache, setFromCache] = useState(false)

  // prepare() 的「這次還算不算有效」計數。收合泡泡或元件卸載時 +1，讓還在飛的 prepare
  // 知道自己過期了——它中間有兩個 await（讀設定、查快取），期間使用者可能已經把泡泡收起來。
  const genRef = useRef(0)

  // 卸載（SPA 換模式）時：作廢在飛的 prepare，並收掉預熱好的 session。
  // 不能只靠 close()——close 只有「泡泡展開時點頭像」會走到，換頁時不會。
  useEffect(
    () => () => {
      genRef.current += 1
      releaseSummarizer()
    },
    [],
  )

  // 使用者展開泡泡時呼叫（意圖明確、但還沒按下開始）：
  // - 已有快取 → 直接把上次結果放出來，不跑模型也不用預熱
  // - 沒快取 → 背景把 Summarizer 建起來，把 cold start 藏在他讀提示文字的那幾秒
  //   （Chrome 官方建議〈Prepare the model at a reasonable time〉）
  const prepare = useCallback(async () => {
    const gen = ++genRef.current
    const settings = await getSettings()
    const cached = await getCachedSummary(variantOf(settings))
    // 已被收合 / 卸載 → 不要動畫面（否則收起來的泡泡會自己彈回來）
    if (gen !== genRef.current) return
    if (cached) {
      setMarkdown(cached.markdown)
      setError('')
      setFromCache(true)
      setPhase('done')
      return
    }
    // 預熱是機會財：失敗不冒錯誤 UI，真正的錯誤留給 summarize()
    await warmSummarizer(createOptions(settings)).catch(() => {})
    // 預熱期間被收合 → 這份 session 沒人要了，別留著
    if (gen !== genRef.current) releaseSummarizer()
  }, [])

  const summarize = useCallback(async ({ force = false } = {}) => {
    setError('')
    setMarkdown('')
    setFromCache(false)
    setPhase('thinking')

    try {
      // 裝置不支援 Summarizer（API 不存在或 unavailable）→ 報錯。downloadable/downloading 不擋，
      // 讓 create 去補語言 adapter（base model 已由 gate 下載，這裡只差語言資料）。
      const avail = typeof Summarizer === 'undefined' ? 'unavailable' : await Summarizer.availability()
      if (avail === 'unavailable') {
        setError('這台裝置無法使用內建 AI 模型（需要 Chrome 138+ 且符合硬體需求）。')
        setPhase('error')
        return
      }

      // 先抽內容；整頁幾乎沒文字才放棄，別浪費時間啟動模型
      const article = extractContent()
      if (!article) {
        setError('這頁我抓不到足夠的文字內容，換一頁再試試看吧。')
        setPhase('error')
        return
      }

      // 依使用者設定決定摘要類型與語氣
      const settings = await getSettings()
      const tone = toneById(settings.tone)
      const variant = variantOf(settings)

      // 半小時內同一頁（同語氣 / 類型）直接用快取
      if (!force) {
        const cached = await getCachedSummary(variant)
        if (cached) {
          setMarkdown(cached.markdown)
          setFromCache(true)
          setPhase('done')
          return
        }
      }

      // 命中 prepare() 的預熱＝零等待；沒預熱過（或設定改了）就在這裡現場建
      const summarizer = await takeSummarizer(createOptions(settings))

      const stream = summarizer.summarizeStreaming(article.text, {
        context: `文章標題：「${article.title}」。這是網頁的內文，${tone.prompt}`,
      })

      // 收到第一個 chunk 才從「思考中」切換成「講話中」
      let raw = ''
      for await (const chunk of stream) {
        raw += chunk
        setPhase('streaming')
        setMarkdown(raw)
      }

      if (!raw) {
        setError('模型沒有產出摘要，換個頁面試試看。')
        setPhase('error')
      } else {
        setPhase('done')
        await setCachedSummary(raw, article.title, variant)
      }
    } catch (err) {
      setError(`摘要失敗：${err instanceof Error ? err.message : String(err)}`)
      setPhase('error')
    }
    // 不在這裡 destroy：實例歸 warm slot 管，留著給「重做」用，收合泡泡時才 release
  }, [])

  const close = useCallback(() => {
    genRef.current += 1 // 讓還在飛的 prepare 失效，別把收起來的泡泡再打開
    setPhase('idle')
    setMarkdown('')
    setError('')
    setFromCache(false)
    releaseSummarizer() // 泡泡收合＝這份 session 沒人要了
  }, [])

  return { phase, markdown, error, fromCache, prepare, summarize, close }
}

// 快取 variant：語氣與摘要類型不同會各自快取
const variantOf = (settings: Settings) => `${settings.tone}:${settings.summaryType}`

// 依使用者設定組出 Summarizer 的 create 選項（預熱與實際摘要必須用同一組，才能命中同一份預熱）
function createOptions(settings: Settings): SummarizerOptions {
  return {
    type: settings.summaryType,
    format: 'markdown',
    length: 'medium',
    sharedContext: toneById(settings.tone).prompt,
  }
}
