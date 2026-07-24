import { useCallback, useState } from 'react'
import { extractDescText, findDescSection, getProductId } from '../lib/productPage'
import { availability, generateProductSummary } from '../lib/productSummary'
import { getCachedProductSummary, setCachedProductSummary } from '../lib/productSummaryCache'
import { getSettings, toneById } from '../lib/settings'

// needs-activation：模型尚未下載，Chrome 要求「使用者手勢」才能開始下載，
// 所以不能在掛載時自動跑，改顯示按鈕讓使用者點一下。
export type ProductPhase =
  | 'idle'
  | 'checking'
  | 'needs-activation'
  | 'generating'
  | 'done'
  | 'error'

// 內文太短就別浪費時間啟動模型
const MIN_CHARS = 100

export interface ProductSummarizing {
  phase: ProductPhase
  data: string | null // 摘要文字（串流時為累積到目前的內容）
  error: string
  fromCache: boolean
  downloadPct: number // 0~100，第一次下載模型時 > 0
  // userInitiated：來自使用者點擊（有手勢），才允許在 downloadable 狀態觸發下載
  run: (opts?: { force?: boolean; userInitiated?: boolean }) => Promise<void>
}

// 流程：availability → 擷取商品說明 → 查快取 →（未命中）Prompt API 串流輸出 → 寫快取。
export function useProductSummary(): ProductSummarizing {
  const [phase, setPhase] = useState<ProductPhase>('idle')
  const [data, setData] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [fromCache, setFromCache] = useState(false)
  const [downloadPct, setDownloadPct] = useState(0)

  const run = useCallback(async ({ force = false, userInitiated = false } = {}) => {
    setError('')
    setData(null)
    setFromCache(false)
    setDownloadPct(0)
    setPhase('checking')

    try {
      const avail = await availability()
      if (avail === 'unavailable') {
        setError('這台裝置無法使用內建 AI 模型（需要 Chrome 138+ 且符合硬體需求）。')
        setPhase('error')
        return
      }
      // 模型尚未就緒且非使用者主動觸發：下載需要手勢，先請使用者點按鈕
      if (avail !== 'available' && !userInitiated) {
        setPhase('needs-activation')
        return
      }

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
      const result = await generateProductSummary(text, toneById(tone).prompt, (acc) => setData(acc))
      setData(result)
      setPhase('done')
      await setCachedProductSummary(productId, tone, result)
    } catch (err) {
      setError(`摘要失敗：${err instanceof Error ? err.message : String(err)}`)
      setPhase('error')
    }
  }, [])

  return { phase, data, error, fromCache, downloadPct, run }
}
