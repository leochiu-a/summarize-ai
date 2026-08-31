import { useCallback, useRef, useState } from 'react'
import {
  generateAssist,
  prewarmReviewAssist,
  releaseReviewAssist,
  type AssistAction,
} from '../lib/reviewAssist'
import { readReviewContext, readReviewDraft, reviewDraftLimit, writeReviewDraft } from '../lib/reviewPage'
import { getSettings, type ToneId } from '../lib/settings'

export type AssistPhase = 'idle' | 'streaming' | 'done' | 'error'

export interface ReviewAssisting {
  phase: AssistPhase
  action: AssistAction | null // 這次跑的是哪個動作（決定結果面板的說法）
  data: string | null // 產出的候選文字（串流時為累積到目前的內容）
  error: string
  prewarm: () => Promise<void> // 工具列出現時：背景把模型載起來，不推論
  run: (action: AssistAction, tone?: ToneId) => Promise<void>
  again: () => Promise<void> // 「換一個」：略過快取，明確要模型換個說法
  apply: () => void // 使用者確認後，才把結果寫回評論輸入框
  dismiss: () => void // 不要這一版，收掉結果面板
  release: () => void // 工具列被拆掉：收掉預熱的 session
}

// 流程：按鈕點下 → 讀輸入框現有文字與表單脈絡 →（同輸入同動作同語氣就沿用上次結果）→
//       串流生成 → phase=done（待確認，先不寫回）→ 使用者按「套用」才 apply()。
//
// 設計原則：
// - 產出永遠不自動覆蓋輸入框。使用者是原作者，要他過目、按下套用才寫回，而且從不代送。
// - 以「動作 + 原文 + 語氣」為快取：同樣的東西再點一次不重跑模型。
//   但「換一個」是使用者明確表示「這版我不要」，必須略過快取真的重跑，
//   否則會拿到一模一樣的文字，看起來就像按鈕壞了。
// - 模型可用性（含下載同意）由工具列自己的 gate 把關（見 ReviewToolbar），這裡不判 availability。
export function useReviewAssist(): ReviewAssisting {
  const [phase, setPhase] = useState<AssistPhase>('idle')
  const [action, setAction] = useState<AssistAction | null>(null)
  const [data, setData] = useState<string | null>(null)
  const [error, setError] = useState('')

  // 上一次跑的輸入與結果（用 ref 不觸發 render），以及「換一個」要重跑什麼
  const lastRef = useRef<{ key: string; result: string } | null>(null)
  const currentRef = useRef<{ action: AssistAction; tone: ToneId } | null>(null)

  const execute = useCallback(async (next: AssistAction, tone: ToneId | undefined, rephrase: boolean) => {
    setError('')
    setAction(next)

    try {
      const draft = readReviewDraft()
      // opening 以外都在潤飾使用者已經寫的東西，沒東西就沒得潤
      if (next !== 'opening' && !draft) {
        setData(null)
        setError('先寫幾句你的心得，我再幫你潤飾得更好讀 ✍️')
        setPhase('error')
        return
      }

      const settings = await getSettings()
      const useTone = tone ?? settings.tone
      currentRef.current = { action: next, tone: useTone }

      // 同樣的動作 + 原文 + 語氣 → 直接用上次結果，不重跑模型。「換一個」例外。
      const key = `${next}|${useTone}|${draft}`
      const last = lastRef.current
      if (!rephrase && last && last.key === key) {
        setData(last.result)
        setPhase('done')
        return
      }

      setData(null)
      setPhase('streaming')
      const result = await generateAssist(
        {
          action: next,
          draft,
          context: readReviewContext(),
          tone: useTone,
          limit: reviewDraftLimit(),
          rephrase,
        },
        (acc) => setData(acc),
      )
      if (!result.trim()) {
        setError('這次沒有產出結果，稍後再試試看。')
        setPhase('error')
        return
      }
      lastRef.current = { key, result }
      setData(result)
      // 完成，但先不寫回——停在 done（待確認），由使用者按「套用」才 apply()
      setPhase('done')
    } catch (err) {
      setError(`失敗了：${err instanceof Error ? err.message : String(err)}`)
      setPhase('error')
    }
  }, [])

  const run = useCallback(
    (next: AssistAction, tone?: ToneId) => execute(next, tone, false),
    [execute],
  )

  const again = useCallback(() => {
    const current = currentRef.current
    if (!current) return Promise.resolve()
    return execute(current.action, current.tone, true)
  }, [execute])

  // 預熱是機會財：失敗不冒錯誤 UI，真正的錯誤留給 run()
  const prewarm = useCallback(async () => {
    await prewarmReviewAssist().then(
      () => {},
      () => {},
    )
  }, [])

  const apply = useCallback(() => {
    if (data) writeReviewDraft(data)
    setPhase('idle')
    setData(null)
    setAction(null)
  }, [data])

  const dismiss = useCallback(() => {
    setPhase('idle')
    setData(null)
    setError('')
    setAction(null)
  }, [])

  const release = useCallback(() => releaseReviewAssist(), [])

  return { phase, action, data, error, prewarm, run, again, apply, dismiss, release }
}
