import { useCallback, useState } from 'react'
import { getProductId } from '../lib/productPage'
import { readProductFacts } from '../lib/productFacts'
import { availability, generateWorthIt } from '../lib/worthIt'
import { getCachedWorthIt, setCachedWorthIt } from '../lib/worthItCache'
import { getSettings } from '../lib/settings'

// needs-activation：模型尚未下載，Chrome 要求「使用者手勢」才能開始下載，
// buddy 的點擊本身就是手勢，所以 userInitiated 會是 true；此狀態主要保險用。
export type WorthPhase = 'idle' | 'checking' | 'needs-activation' | 'generating' | 'done' | 'error'

export interface WorthIting {
  phase: WorthPhase
  data: string | null // 判斷文字（串流時為累積到目前的內容）
  error: string
  fromCache: boolean
  run: (opts?: { force?: boolean; userInitiated?: boolean }) => Promise<void>
  reset: () => void
}

// 流程：availability → 讀商品事實（JSON-LD + DOM）→ 查快取 →（未命中）Prompt API 串流 → 寫快取。
export function useWorthIt(): WorthIting {
  const [phase, setPhase] = useState<WorthPhase>('idle')
  const [data, setData] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [fromCache, setFromCache] = useState(false)

  const run = useCallback(async ({ force = false, userInitiated = false } = {}) => {
    setError('')
    setData(null)
    setFromCache(false)
    setPhase('checking')

    try {
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

      const facts = readProductFacts()
      if (!facts) {
        setError('這頁抓不到商品資料，沒辦法幫你判斷。')
        setPhase('error')
        return
      }

      const settings = await getSettings()
      const tone = settings.tone
      const productId = getProductId() ?? location.pathname

      if (!force) {
        const cached = await getCachedWorthIt(productId, tone)
        if (cached) {
          setData(cached)
          setFromCache(true)
          setPhase('done')
          return
        }
      }

      setPhase('generating')
      // 串流：每收到一塊就更新 data，讓泡泡邊生成邊顯示（語氣沿用 popup 設定）
      const result = await generateWorthIt(facts, tone, (acc) => setData(acc))
      // 模型可能串流結束卻沒吐內容：別進 done（會顯示空白），也別把空字串快取 24h
      if (!result) {
        setError('模型沒有給出判斷，稍後再試試看。')
        setPhase('error')
        return
      }
      setData(result)
      setPhase('done')
      await setCachedWorthIt(productId, tone, result)
    } catch (err) {
      setError(`判斷失敗：${err instanceof Error ? err.message : String(err)}`)
      setPhase('error')
    }
  }, [])

  const reset = useCallback(() => {
    setPhase('idle')
    setData(null)
    setError('')
    setFromCache(false)
  }, [])

  return { phase, data, error, fromCache, run, reset }
}
