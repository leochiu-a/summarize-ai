import type { OverlayScrollbarsComponentRef } from 'overlayscrollbars-react'
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react'
import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import {
  isBusy,
  isDone,
  isOpen,
  isThinking,
  needsActivation as isNeedsActivation,
  type BuddyPhase,
} from '../lib/buddyPhase'
import { useReactions } from '../hooks/useReactions'
import { useTalkingMouth } from '../hooks/useTalkingMouth'
import { useThinkingChatter } from '../hooks/useThinkingChatter'
import { Avatar } from './Avatar'
import { EmojiIcon } from './EmojiIcon'
import { ReactionBar } from './ReactionBar'

// 各模式（SummaryBuddy / WorthBuddy）把自家 hook 的狀態映射成這一份 view，外殼依它呈現。
// open / thinking / busy / done 等布林一律由 phase 推導（見 lib/buddyPhase），這裡不再重複判斷。
export interface BuddyView {
  phase: BuddyPhase // 共用生命週期狀態
  title: string // 泡泡標題
  thinkingLines: string[] // 這個模式的碎念台詞
  content: string // 目前內容（自動捲動 / 動嘴判斷；渲染用 children）
  error: string // 錯誤訊息（空字串代表無錯誤）
  fromCache: boolean // 內容來自快取（顯示快取徽章）
}

export interface BuddyBubbleProps {
  view: BuddyView // 模式整理好的畫面狀態
  onStart: () => void // 開始執行（泡泡未展開時點頭像）
  onClose: () => void // 收合並重置（泡泡展開時點頭像）
  onRerun: () => void // 強制重跑（略過快取）
  children: ReactNode // 內容主體（markdown / 純文字，由模式 component 自己渲染）
  // ── 以下為選用（summary/worth 不傳，行為不變；review 用來做進頁提示與確認流程）──
  openWhenIdle?: boolean // idle 也展開泡泡（一進頁面就主動顯示提示，不必先點頭像）
  actions?: ReactNode // 內容下方的行動按鈕區（如「幫我想想」「套用到評論」）
  showReactions?: boolean // done 時是否顯示 emoji 反應列（預設顯示；review 關掉）
  showRerunButton?: boolean // done 時標題列是否顯示重跑鈕（預設顯示；review 用 actions 自訂）
}

// 重跑鈕文字：各模式一致，故寫死在外殼
const RERUN_LABEL = '重做'

// buddy 的共用外殼：頭像、泡泡框、標題列、思考台詞、錯誤、反應列，以及 tooltip /
// 動嘴 / 自動捲動 / 被催 nag 等純 UI 行為。模式差異全由 view 帶入。
export function BuddyBubble({
  view,
  onStart,
  onClose,
  onRerun,
  children,
  openWhenIdle = false,
  actions,
  showReactions = true,
  showRerunButton = true,
}: BuddyBubbleProps) {
  const { phase, title, thinkingLines, content, error, fromCache } = view
  const open = isOpen(phase) || openWhenIdle // idle 也展開（進頁主動提示）
  const done = isDone(phase)
  const busy = isBusy(phase)
  const needsActivation = isNeedsActivation(phase)
  // 思考態：準備中，或已進入串流但還沒吐出任何字（避免空白泡泡）
  const thinking = isThinking(phase) || (isBusy(phase) && !content)

  const reactions = useReactions()
  const chatter = useThinkingChatter(thinking, thinkingLines)
  const frame = useTalkingMouth(thinking || (open && !done && !!content) || reactions.reacting)
  const scrollerRef = useRef<OverlayScrollbarsComponentRef>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // tooltip 用 Popover API（渲染在 top layer，不會被泡泡的 overflow 裁掉）
  // hint 型 popover 沒有宣告式 hover 觸發，改用 hover / focus 手動開關
  const showTip = useCallback(() => {
    try {
      tooltipRef.current?.showPopover()
    } catch {
      /* 已開啟時 showPopover 會丟例外，忽略 */
    }
  }, [])
  const hideTip = useCallback(() => {
    try {
      tooltipRef.current?.hidePopover()
    } catch {
      /* 已關閉時忽略 */
    }
  }, [])

  // 串流時自動捲到底（OverlayScrollbars 的實際捲動元素是它內部的 viewport）
  useEffect(() => {
    const viewport = scrollerRef.current?.osInstance()?.elements().viewport
    if (viewport) viewport.scrollTop = viewport.scrollHeight
  }, [content])

  const handleActivate = useCallback(() => {
    if (busy) {
      if (thinking) chatter.nag() // 思考中被催 → 回一句不耐煩的話
      return
    }
    // 泡泡目前有顯示（含 openWhenIdle 的提示態）→ 點頭像就收合；否則點頭像 = 開始
    if (open) {
      onClose()
      reactions.reset()
      return
    }
    reactions.reset()
    onStart()
  }, [busy, thinking, open, chatter, onClose, onStart, reactions])

  const handleRerun = useCallback(() => {
    reactions.reset()
    onRerun()
  }, [reactions, onRerun])

  return (
    <div className="buddy">
      {open && (
        <>
          <div className="bubble">
            <div className="bubble-head">
              <span className="title">{title}</span>
              {done && showRerunButton && (
                <span className="bubble-actions">
                  {fromCache && <span className="cache-badge">快取</span>}
                  <button
                    type="button"
                    className="resummarize"
                    aria-label={RERUN_LABEL}
                    onClick={handleRerun}
                    onMouseEnter={showTip}
                    onMouseLeave={hideTip}
                    onFocus={showTip}
                    onBlur={hideTip}
                  >
                    <EmojiIcon code="26a1" label={RERUN_LABEL} />
                  </button>
                  <div ref={tooltipRef} className="tooltip" popover="hint" role="tooltip">
                    {RERUN_LABEL}
                  </div>
                </span>
              )}
            </div>
            {/* 內文交給 OverlayScrollbars：scrollbar 浮層、不佔布局，也不隨高度動畫閃現 */}
            <OverlayScrollbarsComponent
              ref={scrollerRef}
              className="bubble-body"
              defer
              options={{ scrollbars: { autoHide: 'leave', autoHideDelay: 300 } }}
            >
              {thinking && (
                <div className={chatter.impatient ? 'thinking-text impatient' : 'thinking-text'}>
                  {chatter.line}
                </div>
              )}
              {needsActivation && (
                <div className="thinking-text">第一次要下載 AI 模型，再點我一下就開始囉。</div>
              )}
              {error && <div className="error">{error}</div>}
              {children}
              {actions && <div className="bubble-cta">{actions}</div>}
              {done && showReactions && (
                <ReactionBar reaction={reactions.reaction} onReact={reactions.react} />
              )}
            </OverlayScrollbarsComponent>
          </div>
          <div className="tail" />
        </>
      )}
      <Avatar frame={frame} onActivate={handleActivate} />
    </div>
  )
}
