// 內建 AI 模型「同意才下載」的 buddy 泡泡（A 組 consent gate 的 UI）。
//
// 擋在真正的功能 buddy 前面：base model 未就緒時，先問使用者要不要下載並啟用本地 AI，
// 同意才下載，全程本機、不上傳。下載完成後提醒功能已就緒（同頁其他 UI 靠廣播就地復活）。
//
// 刻意不套 BuddyBubble（它的 view 綁 BuddyPhase）：consent 有自己的狀態機，手刻輕量泡泡，
// 複用 content.css 既有的 .buddy / .bubble / .thinking-text / .buddy-btn 樣式。

import { useEffect } from 'react'
import { useModelGate } from '../hooks/useModelGate'
import { Avatar } from './Avatar'

// idle 時頭像停在第 0 影格（閉嘴）
const IDLE_FRAME = 0

export function ConsentBuddy({ onReady }: { onReady?: () => void }) {
  const gate = useModelGate()

  // base model 已就緒（例如別的進入點下載完廣播過來）→ 交棒給功能 buddy。
  // 用 effect 而非 render body 呼叫，避免在 render 期間 setState（React 反模式）。
  const ready = gate.state === 'ready'
  useEffect(() => {
    if (ready) onReady?.()
  }, [ready, onReady])
  if (ready) return null

  // unknown（冷啟動校正中）：先只露頭像，不打擾
  if (gate.state === 'unknown') {
    return (
      <div className="buddy">
        <Avatar frame={IDLE_FRAME} onActivate={() => {}} />
      </div>
    )
  }

  return (
    <div className="buddy">
      <div className="bubble">
        <div className="bubble-head">
          <span className="title">啟用本地 AI</span>
        </div>
        <div className="bubble-body">
          {gate.state === 'consent' && (
            <>
              <div className="thinking-text">
                小夥伴用 Chrome 內建 AI 幫你摘要 / 翻譯，全程在你的裝置上完成、不會上傳。
                第一次使用需要先下載模型（約需一點時間）。要現在下載並啟用嗎？
              </div>
              <div className="bubble-cta">
                <button type="button" className="buddy-btn primary" onClick={() => void gate.accept()}>
                  下載並啟用
                </button>
              </div>
            </>
          )}

          {gate.state === 'downloading' && (
            <div className="thinking-text">
              正在下載 AI 模型…{gate.downloadPct !== null ? ` ${gate.downloadPct}%` : ''}
              <br />
              下載只會進行一次，之後就能直接使用。
            </div>
          )}

          {gate.state === 'done' && (
            <div className="thinking-text">下載完成，已就緒！點我就可以開始使用了 🎉</div>
          )}

          {gate.state === 'error' && <div className="error">{gate.error}</div>}
        </div>
      </div>
      <div className="tail" />
      {/* done 時點頭像 = 交棒給功能 buddy；其餘狀態頭像不觸發（consent 靠泡泡按鈕） */}
      <Avatar frame={IDLE_FRAME} onActivate={gate.state === 'done' ? () => onReady?.() : () => {}} />
    </div>
  )
}
