import { useCallback, useRef, useState } from 'react'
import type { BuddyPhase } from '../lib/buddyPhase'
import { readReviewDraft, writeReviewDraft } from '../lib/reviewPage'
import { availability, generateRewrite } from '../lib/reviewRewrite'
import { getSettings } from '../lib/settings'
import type { ToneId } from '../lib/settings'

export interface ReviewRewriting {
  phase: BuddyPhase
  data: string | null // 潤飾後的文字（串流時為累積到目前的內容）
  error: string
  run: (opts?: { userInitiated?: boolean }) => Promise<void>
  apply: () => void // 使用者確認後，才把潤飾結果寫回評論輸入框
  reset: () => void
}

// 流程：讀輸入框現有文字 →（空則提示先寫）→（原文與上次相同則直接用上次結果）→
//       availability → Rewriter 串流潤飾 → phase=done（待確認，先不寫回）。
// 設計原則：
// - 潤飾結果不自動覆蓋輸入框，交由使用者過目、確認後才套用。
// - 以「原文 + 語氣」為快取：原文沒變又點潤飾/重潤，直接用上次結果，不重跑模型
//   （重跑同一段文字沒意義，只是浪費）。
export function useReviewRewrite(): ReviewRewriting {
  const [phase, setPhase] = useState<BuddyPhase>('idle')
  const [data, setData] = useState<string | null>(null)
  const [error, setError] = useState('')

  // 上次潤飾用的原文 + 語氣 + 結果（用 ref 不觸發 render）
  const lastRef = useRef<{ draft: string; tone: ToneId; result: string } | null>(null)

  const run = useCallback(async ({ userInitiated = false } = {}) => {
    setError('')
    setPhase('thinking')

    try {
      // 先讀使用者寫的內容：沒寫東西就沒得潤飾，直接提示
      const draft = readReviewDraft()
      if (!draft) {
        setData(null)
        setError('先寫幾句你的心得，我再幫你潤飾得更好讀 ✍️')
        setPhase('error')
        return
      }

      const settings = await getSettings()
      const tone = settings.tone

      // 原文與語氣都跟上次一樣 → 直接用上次結果，不重跑模型
      const last = lastRef.current
      if (last && last.draft === draft && last.tone === tone) {
        setData(last.result)
        setPhase('done')
        return
      }

      setData(null)

      const avail = await availability()
      if (avail === 'unavailable') {
        setError('這台裝置無法使用內建 AI 模型（需要 Chrome 138+ 且符合硬體需求）。')
        setPhase('error')
        return
      }
      // 模型尚未就緒且非使用者主動觸發：下載需要手勢，先請使用者點一下
      if (avail !== 'available' && !userInitiated) {
        setPhase('needs-activation')
        return
      }

      setPhase('streaming')
      const result = await generateRewrite(draft, tone, (acc) => setData(acc))
      if (!result) {
        setError('潤飾沒有結果，稍後再試試看。')
        setPhase('error')
        return
      }
      lastRef.current = { draft, tone, result } // 記住這次，供下次比對
      setData(result)
      // 完成潤飾，但先不寫回——停在 done（待確認），由使用者按「套用」才 apply()
      setPhase('done')
    } catch (err) {
      setError(`潤飾失敗：${err instanceof Error ? err.message : String(err)}`)
      setPhase('error')
    }
  }, [])

  // 使用者確認後才寫回評論輸入框（buddy 不代送，仍由使用者自己按送出）
  const apply = useCallback(() => {
    if (data) writeReviewDraft(data)
    setPhase('idle')
    setData(null)
  }, [data])

  const reset = useCallback(() => {
    setPhase('idle')
    setData(null)
    setError('')
  }, [])

  return { phase, data, error, run, apply, reset }
}
