import { useEffect } from 'react'
import { useProductSummary } from '../hooks/useProductSummary'
import { EmojiIcon } from './EmojiIcon'

// sparkle icon（對齊 KKday 原生 AI 摘要框的火花圖示風格）
function SparkleIcon() {
  return (
    <svg className="ps-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7.08 5.18c.34-.81 1.5-.81 1.84 0l1.59 3.77a1 1 0 00.53.53l3.77 1.6c.82.34.82 1.49 0 1.84l-3.77 1.59a1 1 0 00-.53.53l-1.59 3.77c-.34.82-1.5.82-1.84 0l-1.6-3.77a1 1 0 00-.53-.53l-3.77-1.59c-.81-.35-.81-1.5 0-1.84l3.77-1.6a1 1 0 00.53-.53l1.6-3.77zM16.08 2.18c.34-.81 1.5-.81 1.84 0l.4.96a1 1 0 00.54.53l.96.41c.81.34.81 1.5 0 1.84l-.96.4a1 1 0 00-.54.54l-.4.96c-.34.81-1.5.81-1.84 0l-.41-.96a1 1 0 00-.53-.54l-.96-.4c-.82-.34-.82-1.5 0-1.84l.96-.41a1 1 0 00.53-.53l.41-.96z" />
    </svg>
  )
}

// 把商品說明摘成一段話，串流顯示。
//
// 掛載時不直接產生摘要，只做 prepare()：有快取就直接顯示上次結果，沒快取則在背景把模型載起來
// 並停在 idle 等使用者按「產生 AI 摘要」。理由有兩個——逛過去不看卡片的人不該被跑掉一次推論；
// 而按下按鈕時 cold start 已經被預熱吃掉（Chrome 官方建議〈Prepare the model at a reasonable
// time〉：意圖明確時就先 create，不要等按下 Generate）。
//
// 這張卡片只在 Gemini Nano 已就緒時才被注入層建立（見 productPageSummary.ts 的 gate），
// 所以掛載就預熱是安全的——不會觸發模型下載，不需要使用者手勢。
export function ProductSummaryCard() {
  const { phase, data, error, fromCache, prepare, run, release } = useProductSummary()

  useEffect(() => {
    void prepare()
    return release // 卡片被拆掉（SPA 換頁）時收掉預熱的 session
  }, [prepare, release])

  return (
    <div className="ps-card">
      <div className="ps-head">
        <SparkleIcon />
        <span className="ps-title">AI 商品重點摘要</span>
        {fromCache && <span className="ps-badge">快取</span>}
      </div>

      {/* 還沒開始：邀請 + 按鈕（模型已在背景預熱，按下去就開始串流） */}
      {phase === 'idle' && (
        <div className="ps-idle">
          <p className="ps-raw">想快速看懂這個商品嗎？我用一段話幫你抓重點。</p>
          <button type="button" className="ps-activate" onClick={() => void run()}>
            <EmojiIcon code="2728" />
            產生 AI 摘要
          </button>
        </div>
      )}

      {/* 還沒收到任何內容時才顯示 skeleton（檢查中，或生成中但第一塊還沒到） */}
      {(phase === 'checking' || (phase === 'generating' && !data)) && (
        <div className="ps-skeleton">
          <div className="ps-sk-line" />
          <div className="ps-sk-line w70" />
          <div className="ps-sk-line w50" />
        </div>
      )}

      {/* 失敗了要留一條路回去：使用者已經按過一次按鈕，不該只剩一行錯誤訊息、只能重整整頁 */}
      {phase === 'error' && (
        <div className="ps-idle">
          <p className="ps-error">{error}</p>
          <button type="button" className="ps-activate" onClick={() => void run()}>
            <EmojiIcon code="2728" />
            再試一次
          </button>
        </div>
      )}

      {/* 摘要文字：串流中即時更新，完成後定稿 */}
      {data && (phase === 'generating' || phase === 'done') && <p className="ps-raw">{data}</p>}
    </div>
  )
}
