import { useCallback, useEffect, useRef, useState } from 'react'
import snarkdown from 'snarkdown'
import { Avatar } from './components/Avatar'
import { EmojiIcon } from './components/EmojiIcon'
import { ReactionBar } from './components/ReactionBar'
import { useReactions } from './hooks/useReactions'
import { useSummarizer } from './hooks/useSummarizer'
import { useTalkingMouth } from './hooks/useTalkingMouth'
import { useThinkingChatter } from './hooks/useThinkingChatter'
import { useWorthIt } from './hooks/useWorthIt'
import { isProductPage } from './lib/productPage'
import { escapeHtml } from './lib/summarizer'
import { getSettings } from './lib/settings'

// buddy 的兩種工作：
// - summary：整頁摘要（非商品頁的預設，行為同以往）
// - worth：商品頁專屬「值不值得買」判斷（結論先行 + 短理由）
type Mode = 'summary' | 'worth'

export function Buddy() {
  const summ = useSummarizer()
  const worth = useWorthIt()
  const [mode, setMode] = useState<Mode>('summary')
  const reactions = useReactions()

  // 依當前 mode 把兩個 hook 的狀態正規化成一組統一的畫面狀態
  const view =
    mode === 'worth'
      ? {
          open: worth.phase !== 'idle',
          title: '值不值得買',
          thinking: worth.phase === 'checking' || (worth.phase === 'generating' && !worth.data),
          content: worth.data ?? '',
          isMarkdown: false,
          error: worth.phase === 'error' ? worth.error : '',
          needsActivation: worth.phase === 'needs-activation',
          done: worth.phase === 'done',
          fromCache: worth.fromCache,
          busy: worth.phase === 'checking' || worth.phase === 'generating',
        }
      : {
          open: summ.phase !== 'idle',
          title: '頁面摘要',
          thinking: summ.phase === 'thinking',
          content: summ.markdown,
          isMarkdown: true,
          error: summ.phase === 'error' ? summ.error : '',
          needsActivation: false,
          done: summ.phase === 'done',
          fromCache: summ.fromCache,
          busy: summ.phase === 'thinking' || summ.phase === 'speaking',
        }

  const chatter = useThinkingChatter(view.thinking)
  const frame = useTalkingMouth(view.thinking || (view.open && !view.done && !!view.content) || reactions.reacting)
  const bubbleRef = useRef<HTMLDivElement>(null)
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

  // 串流時自動捲到底
  useEffect(() => {
    const el = bubbleRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [view.content])

  // 收合目前 mode 的泡泡
  const closeActive = useCallback(() => {
    if (mode === 'worth') worth.reset()
    else summ.close()
  }, [mode, worth, summ])

  // 依頁面決定要跑哪個流程（點擊當下才判斷，SPA 換頁後 buddy 仍常駐）
  const startForPage = useCallback(
    (opts?: { auto?: boolean }) => {
      reactions.reset()
      if (isProductPage()) {
        setMode('worth')
        // buddy 點擊本身是使用者手勢，允許在需要時觸發模型下載；自動觸發則不強制下載
        void worth.run({ userInitiated: !opts?.auto })
      } else {
        setMode('summary')
        void summ.summarize()
      }
    },
    [reactions, worth, summ],
  )

  // 若使用者開啟「每頁自動摘要」，載入時自動觸發一次（依頁面選對應模式）
  const autoRan = useRef(false)
  useEffect(() => {
    if (autoRan.current) return
    autoRan.current = true
    void getSettings().then((s) => {
      if (s.autoRun) startForPage({ auto: true })
    })
  }, [startForPage])

  const handleActivate = useCallback(() => {
    if (view.busy) {
      if (view.thinking) chatter.nag() // 思考中被催 → 回一句不耐煩的話
      return
    }
    if (view.open) {
      closeActive() // 已展開 → 收合
      reactions.reset()
      return
    }
    startForPage()
  }, [view.busy, view.thinking, view.open, chatter, closeActive, reactions, startForPage])

  // 重新抓取：重跑目前 mode（強制略過快取）
  const rerun = useCallback(() => {
    reactions.reset()
    if (mode === 'worth') void worth.run({ force: true, userInitiated: true })
    else void summ.summarize(true)
  }, [mode, worth, summ, reactions])

  const rerunLabel = mode === 'worth' ? '重新判斷' : '重新抓取'
  // 頭像 hover 提示：依頁面預告點下去會做什麼（商品頁 → 值不值得買）
  const avatarHint = isProductPage() ? '點我看這個商品值不值得買' : '點我摘要這個頁面'

  return (
    <div className="buddy">
      {view.open && (
        <>
          <div className="bubble" ref={bubbleRef}>
            <div className="bubble-head">
              <span className="title">{view.title}</span>
              {view.done && (
                <span className="bubble-actions">
                  {view.fromCache && <span className="cache-badge">快取</span>}
                  <button
                    type="button"
                    className="resummarize"
                    aria-label={rerunLabel}
                    onClick={rerun}
                    onMouseEnter={showTip}
                    onMouseLeave={hideTip}
                    onFocus={showTip}
                    onBlur={hideTip}
                  >
                    <EmojiIcon code="26a1" label={rerunLabel} />
                  </button>
                  <div ref={tooltipRef} className="tooltip" popover="hint" role="tooltip">
                    {rerunLabel}
                  </div>
                </span>
              )}
            </div>
            {view.thinking && (
              <div className={chatter.impatient ? 'thinking-text impatient' : 'thinking-text'}>
                {chatter.line}
              </div>
            )}
            {view.needsActivation && (
              <div className="thinking-text">第一次要下載 AI 模型，再點我一下就開始囉。</div>
            )}
            {view.error && <div className="error">{view.error}</div>}
            {view.content &&
              (view.isMarkdown ? (
                <div
                  className="content"
                  dangerouslySetInnerHTML={{ __html: snarkdown(escapeHtml(view.content)) }}
                />
              ) : (
                <div className="content worth-text">{view.content}</div>
              ))}
            {view.done && <ReactionBar reaction={reactions.reaction} onReact={reactions.react} />}
          </div>
          <div className="tail" />
        </>
      )}
      <Avatar frame={frame} onActivate={handleActivate} title={avatarHint} />
    </div>
  )
}
