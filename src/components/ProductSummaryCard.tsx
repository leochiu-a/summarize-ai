import { useEffect } from 'react'
import { useProductSummary } from '../hooks/useProductSummary'

// sparkle icon（對齊 KKday 原生 AI 摘要框的火花圖示風格）
function SparkleIcon() {
  return (
    <svg className="ps-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7.08 5.18c.34-.81 1.5-.81 1.84 0l1.59 3.77a1 1 0 00.53.53l3.77 1.6c.82.34.82 1.49 0 1.84l-3.77 1.59a1 1 0 00-.53.53l-1.59 3.77c-.34.82-1.5.82-1.84 0l-1.6-3.77a1 1 0 00-.53-.53l-3.77-1.59c-.81-.35-.81-1.5 0-1.84l3.77-1.6a1 1 0 00.53-.53l1.6-3.77zM16.08 2.18c.34-.81 1.5-.81 1.84 0l.4.96a1 1 0 00.54.53l.96.41c.81.34.81 1.5 0 1.84l-.96.4a1 1 0 00-.54.54l-.4.96c-.34.81-1.5.81-1.84 0l-.41-.96a1 1 0 00-.53-.54l-.96-.4c-.82-.34-.82-1.5 0-1.84l.96-.41a1 1 0 00.53-.53l.41-.96z" />
    </svg>
  )
}

// 自動摘要商品說明，串流顯示成一段話。掛載即執行。
export function ProductSummaryCard() {
  const { phase, data, error, fromCache, run } = useProductSummary()

  useEffect(() => {
    run()
  }, [run])

  return (
    <div className="ps-card">
      <div className="ps-head">
        <SparkleIcon />
        <span className="ps-title">AI 商品重點摘要</span>
        {fromCache && <span className="ps-badge">快取</span>}
      </div>

      {phase === 'needs-activation' && (
        <button className="ps-activate" onClick={() => run({ userInitiated: true })}>
          點我產生商品重點摘要（首次需下載 AI 模型）
        </button>
      )}

      {/* 還沒收到任何內容時才顯示 skeleton（檢查中，或生成中但第一塊還沒到） */}
      {(phase === 'checking' || (phase === 'generating' && !data)) && (
        <div className="ps-skeleton">
          <div className="ps-sk-line" />
          <div className="ps-sk-line w70" />
          <div className="ps-sk-line w50" />
        </div>
      )}

      {phase === 'error' && <div className="ps-error">{error}</div>}

      {/* 摘要文字：串流中即時更新，完成後定稿 */}
      {data && (phase === 'generating' || phase === 'done') && <p className="ps-raw">{data}</p>}
    </div>
  )
}
