import { useCallback, useState } from 'react'
import type { BuddyPhase } from '../lib/buddyPhase'
import { getProductId } from '../lib/productPage'
import { readProductFacts } from '../lib/productFacts'
import { generateWorthIt } from '../lib/worthIt'
import { getCachedWorthIt, setCachedWorthIt } from '../lib/worthItCache'
import { getSettings } from '../lib/settings'

export interface WorthIting {
  phase: BuddyPhase
  data: string | null // 判斷文字（串流時為累積到目前的內容）
  error: string
  fromCache: boolean
  run: (opts?: { force?: boolean }) => Promise<void>
  reset: () => void
}

// 流程：讀商品事實（JSON-LD + DOM）→ 查快取 →（未命中）Prompt API 串流 → 寫快取。
// 模型可用性（含下載同意）已由 consent gate 在外殼統一把關，這裡不再自己判 availability。
export function useWorthIt(): WorthIting {
  const [phase, setPhase] = useState<BuddyPhase>('idle')
  const [data, setData] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [fromCache, setFromCache] = useState(false)

  const run = useCallback(async ({ force = false } = {}) => {
    setError('')
    setData(null)
    setFromCache(false)
    setPhase('thinking') // 準備中：讀商品事實，都還沒吐字

    try {
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

      setPhase('streaming')
      // 串流：每收到一塊就更新 data，讓泡泡邊生成邊顯示（語氣沿用 popup 設定）
      const result = await generateWorthIt(facts, tone, (acc) => setData(acc))
      // 模型可能串流結束卻沒吐內容（或只吐出破格的 JSON、抽不出欄位）：
      // 別進 done（會顯示空白），也別把空字串快取 24h
      if (!result.text) {
        setError('模型沒有給出判斷，稍後再試試看。')
        setPhase('error')
        return
      }
      setData(result.text)
      setPhase('done')
      await setCachedWorthIt(productId, tone, result.text)
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
