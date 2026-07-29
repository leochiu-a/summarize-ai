import { useCallback, useRef, useState } from 'react'
import { extractDescText, findDescSection, getProductId } from '../lib/productPage'
import {
  generateProductSummary,
  prewarmProductSummary,
  releaseProductSummary,
} from '../lib/productSummary'
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
  prepare: () => Promise<void>
  run: (opts?: { force?: boolean }) => Promise<void>
  release: () => void
}

// 兩段式流程：
// - prepare()：卡片出現時呼叫 → 有快取直接顯示，沒快取就背景預熱 session、停在 idle 等按鈕。
// - run()：使用者按下「產生 AI 摘要」才真的跑。擷取商品說明 → 查快取 →
//   （未命中）Prompt API 串流輸出 → 寫快取。
// 模型可用性（含下載同意）已由注入層 gate 統一把關（gate 未就緒不注入這張卡片），
// 這裡不再自己判 availability——卡片被掛載＝模型已就緒。
export function useProductSummary(): ProductSummarizing {
  const [phase, setPhase] = useState<ProductPhase>('idle')
  const [data, setData] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [fromCache, setFromCache] = useState(false)

  // prepare() 的「這次還算不算有效」計數：卡片被拆掉（release）時 +1，讓還在飛的 prepare
  // 知道自己過期了——SPA 換商品時 cleanup 會先跑完，prepare 的尾巴才回來。
  const genRef = useRef(0)

  // 卡片一出現就呼叫：有快取直接顯示（不跑模型也不預熱），沒快取才背景預熱 baseline session
  // （Chrome 官方建議〈Prepare the model at a reasonable time〉）
  const prepare = useCallback(async () => {
    const gen = ++genRef.current
    const { tone } = await getSettings()
    const productId = getProductId() ?? location.pathname
    const cached = await getCachedProductSummary(productId, tone)
    // 卡片已被拆掉 → 不要動畫面，也不要去建 session（否則會留下沒人 release 的 baseline）
    if (gen !== genRef.current) return
    if (cached) {
      setData(cached)
      setError('')
      setFromCache(true)
      setPhase('done')
      return
    }
    // 預熱是機會財：失敗不冒錯誤 UI，真正的錯誤留給 run()
    await prewarmProductSummary(tone).catch(() => {})
    if (gen !== genRef.current) releaseProductSummary()
  }, [])

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
    // 這裡刻意不 release：warm slot 是模組級的、release() 沒有 ownership 概念，
    // 而串流結束的時機可能落在「卡片已被拆掉、新卡片已經預熱好」之後——那樣就會收掉
    // 新卡片的 baseline，害它按下按鈕時反而要吃完整 cold start。
    // 釋放統一由卡片的 unmount cleanup（release）負責，只有一條路徑。
  }, [])

  // 卡片被拆掉（SPA 換頁）時釋放預熱中的 session，並作廢還在飛的 prepare
  const release = useCallback(() => {
    genRef.current += 1
    releaseProductSummary()
  }, [])

  return { phase, data, error, fromCache, prepare, run, release }
}
