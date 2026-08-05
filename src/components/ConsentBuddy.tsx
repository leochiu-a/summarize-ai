// 內建 AI 模型「同意才下載」的 buddy 泡泡（A 組 consent gate 的 UI）。
//
// 擋在真正的功能 buddy 前面：base model 未就緒時，先問使用者要不要下載並啟用本地 AI，
// 同意才下載，全程本機、不上傳。下載完成後提醒功能已就緒（同頁其他 UI 靠廣播就地復活）。
//
// 泡泡一律可收合（點頭像或右上角 ×）：
// - consent / downloading / done 是有行動可做的狀態 → 進入時自動展開。
// - error（裝置不支援）沒有行動可做，只會擋畫面 → **預設收合**，想看原因再點頭像。
//   展開後可再攤開「偵測細節」，把 probe 的原始線索列出來（unavailable 的原因太多，光一句
//   「裝置不支援」使用者無從判斷自己是差在哪）。
//
// 刻意不套 BuddyBubble（它的 view 綁 BuddyPhase）：consent 有自己的狀態機，手刻輕量泡泡，
// 複用 content.css 既有的 .buddy / .bubble / .thinking-text / .buddy-btn 樣式。

import { useCallback, useEffect, useState } from 'react'
import { useModelGate } from '../hooks/useModelGate'
import { getGateDiagnostics, unavailableKind } from '../lib/modelGate'
import { Avatar } from './Avatar'
import { EmojiIcon } from './EmojiIcon'

// idle 時頭像停在第 0 影格（閉嘴）
const IDLE_FRAME = 0

// 這些狀態有事情要跟使用者說（或要他決定）→ 進入時自動展開泡泡
const AUTO_OPEN_STATES = ['consent', 'downloading', 'done']

export function ConsentBuddy({ onReady }: { onReady?: () => void }) {
  const gate = useModelGate()
  const [open, setOpen] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  // 進入「有行動可做」的狀態才自動展開；error 不在其中，所以預設收合、不擋畫面。
  // 依 state 變化觸發 → 使用者手動收合後不會被重新打開。
  useEffect(() => {
    if (AUTO_OPEN_STATES.includes(gate.state)) setOpen(true)
  }, [gate.state])

  // base model 已就緒（例如別的進入點下載完廣播過來）→ 交棒給功能 buddy。
  // 用 effect 而非 render body 呼叫，避免在 render 期間 setState（React 反模式）。
  const ready = gate.state === 'ready'
  useEffect(() => {
    if (ready) onReady?.()
  }, [ready, onReady])

  const toggle = useCallback(() => setOpen((v) => !v), [])

  if (ready) return null

  // http 頁面（非安全內容）：內建 AI 的介面根本不存在，不是裝置的問題 → 標題直接說「這個網站不適用」
  const insecurePage = gate.state === 'error' && unavailableKind() === 'insecure-page'

  // unknown（冷啟動校正中）：先只露頭像，不打擾
  if (gate.state === 'unknown' || !open) {
    return (
      <div className="buddy">
        <Avatar frame={IDLE_FRAME} onActivate={toggle} />
      </div>
    )
  }

  return (
    <div className="buddy">
      <div className="bubble">
        <div className="bubble-head">
          <span className="title">{insecurePage ? '這個網站不適用' : '啟用本地 AI'}</span>
          <button type="button" className="bubble-close" aria-label="關閉" onClick={() => setOpen(false)}>
            ×
          </button>
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
            <>
              <div className="consent-done">
                <span className="consent-done-emoji">
                  <EmojiIcon code="1f61c" label="完成" />
                </span>
                <span>下載完成，已就緒！</span>
              </div>
              <div className="bubble-cta">
                <button type="button" className="buddy-btn primary" onClick={() => onReady?.()}>
                  開始使用
                </button>
              </div>
            </>
          )}

          {gate.state === 'error' && (
            <>
              {/* 網站不適用不是使用者的錯，用中性灰字；真的是裝置/模型出問題才用紅字 */}
              <div className={insecurePage ? 'notice' : 'error'}>{gate.error}</div>
              <div className="bubble-cta">
                <button
                  type="button"
                  className="buddy-btn ghost"
                  onClick={() => setShowDetails((v) => !v)}
                  aria-expanded={showDetails}
                >
                  {showDetails ? '收起偵測細節' : '偵測細節'}
                </button>
              </div>
              {showDetails && <GateDiagnosticsPanel />}
            </>
          )}
        </div>
      </div>
      <div className="tail" />
      {/* 點頭像＝展開/收合泡泡（consent 流程的實際操作在泡泡裡的按鈕） */}
      <Avatar frame={IDLE_FRAME} onActivate={toggle} />
    </div>
  )
}

// probe 的原始線索。只給「怎麼判到 unavailable」的事實，不臆測原因、也不列一堆通用需求
// （那些看了也不知道自己差在哪，真正有用的是下面這幾個實測值）。
function GateDiagnosticsPanel() {
  const d = getGateDiagnostics()
  const rows: [string, string][] = [
    ['Chrome 版本', d.chromeVersion],
    ['頁面 origin', d.origin],
    ['安全內容', d.secureContext === null ? '（未偵測）' : d.secureContext ? '是' : '否（非 HTTPS）'],
    ['LanguageModel API', d.apiPresent ? '存在' : '不存在'],
    ['availability()', d.availability ?? '（沒問到）'],
    ['params()', d.params || '（沒問到）'],
    ['錯誤', d.probeError || '（無）'],
  ]
  const report = rows.map(([k, v]) => `${k}: ${v}`).join('\n') + `\nUA: ${d.userAgent}`

  return (
    <div className="gate-diagnostics">
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="bubble-cta">
        <button
          type="button"
          className="buddy-btn ghost"
          onClick={() => void navigator.clipboard?.writeText(report)}
        >
          複製診斷資訊
        </button>
      </div>
    </div>
  )
}
