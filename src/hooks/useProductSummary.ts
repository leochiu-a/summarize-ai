import { useCallback, useState } from 'react'
import { extractDescText, findDescSection, getProductId } from '../lib/productPage'
import { generateProductSummary } from '../lib/productSummary'
import { getCachedProductSummary, setCachedProductSummary } from '../lib/productSummaryCache'
import { getSettings } from '../lib/settings'

export type ProductPhase = 'idle' | 'checking' | 'generating' | 'done' | 'error'

// 內文太短就別浪費時間啟動模型
const MIN_CHARS = 100

export interface ProductSummarizing {
  phase: ProductPhase
  data: string | null // 摘要文字（串流時為累積到目前的內容）
  error: string
  fromCache: boolean
  run: (opts?: { force?: boolean }) => Promise<void>
}

// 流程：擷取商品說明 → 查快取 →（未命中）Prompt API 串流輸出 → 寫快取。
// 模型可用性（含下載同意）已由注入層 gate 統一把關（gate 未就緒不注入這張卡片），
// 這裡不再自己判 availability——卡片被掛載＝模型已就緒。
export function useProductSummary(): ProductSummarizing {
  const [phase, setPhase] = useState<ProductPhase>('idle')
  const [data, setData] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [fromCache, setFromCache] = useState(false)

  const run = useCallback(async ({ force = false } = {}) => {
    setError('')
    setData(null)
    setFromCache(false)
    setPhase('checking')

    try {
      const section = findDescSection()
      const text = section ? extractDescText(section) : ''
      if (text.length < MIN_CHARS) {
        setError('抓不到足夠的商品說明內容。')
        setPhase('error')
        return
      }

      const settings = await getSettings()
      const tone = settings.tone
      const productId = getProductId() ?? location.pathname

      if (!force) {
        const cached = await getCachedProductSummary(productId, tone)
        if (cached) {
          setData(cached)
          setFromCache(true)
          setPhase('done')
          return
        }
      }

      setPhase('generating')
      // 串流：每收到一塊就更新 data，讓卡片邊生成邊顯示（語氣沿用 popup 設定）
      const result = await generateProductSummary(text, tone, (acc) => setData(acc))
      // 模型可能串流結束卻沒吐內容：別進 done（會顯示空白卡片），也別把空字串快取 24h
      if (!result) {
        setError('模型沒有產出摘要，稍後再試試看。')
        setPhase('error')
        return
      }
      setData(result)
      setPhase('done')
      await setCachedProductSummary(productId, tone, result)
    } catch (err) {
      setError(`摘要失敗：${err instanceof Error ? err.message : String(err)}`)
      setPhase('error')
    }
  }, [])

  return { phase, data, error, fromCache, run }
}
