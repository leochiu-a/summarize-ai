import { useCallback, useState } from 'react'
import type { BuddyPhase } from '../lib/buddyPhase'
import { extractContent, pickOutputLanguage } from '../lib/summarizer'
import { getSettings, toneById } from '../lib/settings'
import { getCachedSummary, setCachedSummary } from '../lib/summaryCache'

export interface Summarizing {
  phase: BuddyPhase
  markdown: string
  error: string
  fromCache: boolean
  summarize: (opts?: { force?: boolean }) => Promise<void>
  close: () => void
}

// 核心摘要流程：availability →（unavailable 報錯）→ 擷取內容 → 查快取 →（未命中）串流摘要 → 寫快取。
// force=true 略過快取、強制重跑（重新摘要按鈕用）。
//
// 為什麼這裡仍要判 availability，其他功能 hook 卻拿掉了：
// consent gate 用 LanguageModel（Prompt API）當 base-model probe。Summarizer 雖共用同一顆
// Gemini Nano，但這裡 create 帶了 outputLanguage（見下方），可能需要額外的語言 adapter——
// availability 是 per-options 回報的，base model ready 不代表這組語言選項就緒。所以 Summarizer
// 得自己確認。downloadable 時直接讓 create 去補 adapter（使用者已在 gate 同意過下載）；只有
// unavailable（裝置不支援）才擋下報錯。
export function useSummarizer(): Summarizing {
  const [phase, setPhase] = useState<BuddyPhase>('idle')
  const [markdown, setMarkdown] = useState('')
  const [error, setError] = useState('')
  const [fromCache, setFromCache] = useState(false)

  const summarize = useCallback(async ({ force = false } = {}) => {
    setError('')
    setMarkdown('')
    setFromCache(false)
    setPhase('thinking')

    let summarizer: Summarizer | null = null
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
      const variant = `${settings.tone}:${settings.summaryType}`

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

      const createOptions = {
        type: settings.summaryType,
        format: 'markdown' as const,
        length: 'medium' as const,
        sharedContext: tone.prompt,
      }

      // 部分語言可能不在支援清單，失敗時退回預設輸出語言
      try {
        summarizer = await Summarizer.create({ ...createOptions, outputLanguage: pickOutputLanguage() })
      } catch {
        summarizer = await Summarizer.create(createOptions)
      }

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
    } finally {
      summarizer?.destroy()
    }
  }, [])

  const close = useCallback(() => {
    setPhase('idle')
    setMarkdown('')
    setError('')
    setFromCache(false)
  }, [])

  return { phase, markdown, error, fromCache, summarize, close }
}
