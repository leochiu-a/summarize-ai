import { useCallback, useState } from 'react'
import { extractContent, pickOutputLanguage } from '../lib/summarizer'
import { getCachedSummary, setCachedSummary } from '../lib/summaryCache'

export type Phase = 'idle' | 'thinking' | 'speaking' | 'done' | 'error'

export interface Summarizing {
  phase: Phase
  markdown: string
  error: string
  fromCache: boolean
  summarize: (force?: boolean) => Promise<void>
  close: () => void
}

// 核心摘要流程：擷取內容 → 查快取 →（未命中）串流摘要 → 寫快取。
// force=true 略過快取、強制重跑（重新摘要按鈕用）。
export function useSummarizer(): Summarizing {
  const [phase, setPhase] = useState<Phase>('idle')
  const [markdown, setMarkdown] = useState('')
  const [error, setError] = useState('')
  const [fromCache, setFromCache] = useState(false)

  const summarize = useCallback(async (force = false) => {
    setError('')
    setMarkdown('')
    setFromCache(false)
    setPhase('thinking')

    let summarizer: Summarizer | null = null
    try {
      if (typeof Summarizer === 'undefined') {
        setError('這個瀏覽器不支援內建 Summarizer API（需要 Chrome 138+，且裝置符合硬體需求）。')
        setPhase('error')
        return
      }

      const availability = await Summarizer.availability()
      if (availability === 'unavailable') {
        setError('Summarizer 模型在這台裝置上無法使用。')
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

      // 半小時內同一頁直接用快取
      if (!force) {
        const cached = await getCachedSummary()
        if (cached) {
          setMarkdown(cached.markdown)
          setFromCache(true)
          setPhase('done')
          return
        }
      }

      const createOptions = {
        type: 'key-points' as const,
        format: 'markdown' as const,
        length: 'medium' as const,
      }

      // 部分語言可能不在支援清單，失敗時退回預設輸出語言
      try {
        summarizer = await Summarizer.create({ ...createOptions, outputLanguage: pickOutputLanguage() })
      } catch {
        summarizer = await Summarizer.create(createOptions)
      }

      const stream = summarizer.summarizeStreaming(article.text, {
        context: `文章標題：「${article.title}」。這是網頁的內文，請整理重點給讀者。`,
      })

      // 收到第一個 chunk 才從「思考中」切換成「講話中」
      let raw = ''
      for await (const chunk of stream) {
        raw += chunk
        setPhase('speaking')
        setMarkdown(raw)
      }

      if (!raw) {
        setError('模型沒有產出摘要，換個頁面試試看。')
        setPhase('error')
      } else {
        setPhase('done')
        await setCachedSummary(raw, article.title)
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
