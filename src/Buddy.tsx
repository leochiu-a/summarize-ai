import { useCallback, useEffect, useRef } from 'react'
import snarkdown from 'snarkdown'
import { Avatar } from './components/Avatar'
import { ReactionBar } from './components/ReactionBar'
import { useReactions } from './hooks/useReactions'
import { useSummarizer } from './hooks/useSummarizer'
import { useTalkingMouth } from './hooks/useTalkingMouth'
import { useThinkingChatter } from './hooks/useThinkingChatter'
import { escapeHtml } from './lib/summarizer'

export function Buddy() {
  const { phase, markdown, error, fromCache, summarize, close } = useSummarizer()
  const reactions = useReactions()
  const chatter = useThinkingChatter(phase === 'thinking')
  const frame = useTalkingMouth(phase === 'thinking' || phase === 'speaking' || reactions.reacting)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const busy = phase === 'thinking' || phase === 'speaking'

  // 串流時自動捲到底
  useEffect(() => {
    const el = bubbleRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [markdown])

  const handleActivate = useCallback(() => {
    if (phase === 'thinking') {
      chatter.nag() // 思考中被催 → 回一句不耐煩的話
      return
    }
    if (busy) return
    if (phase !== 'idle') {
      close() // 已展開 → 收合
      reactions.reset()
      return
    }
    reactions.reset()
    void summarize()
  }, [phase, busy, chatter, close, reactions, summarize])

  const resummarize = useCallback(() => {
    reactions.reset()
    void summarize(true)
  }, [reactions, summarize])

  return (
    <div className="buddy">
      {phase !== 'idle' && (
        <>
          <div className="bubble" ref={bubbleRef}>
            <div className="bubble-head">
              <span className="title">頁面摘要</span>
              {phase === 'done' && (
                <span className="bubble-actions">
                  {fromCache && <span className="cache-badge">快取</span>}
                  <button
                    type="button"
                    className="resummarize"
                    aria-label="重新摘要"
                    title="重新摘要"
                    onClick={resummarize}
                  >
                    ↻
                  </button>
                </span>
              )}
            </div>
            {phase === 'thinking' && (
              <div className={chatter.impatient ? 'thinking-text impatient' : 'thinking-text'}>
                {chatter.line}
              </div>
            )}
            {phase === 'error' && <div className="error">{error}</div>}
            {(phase === 'speaking' || phase === 'done') && (
              <div
                className="content"
                dangerouslySetInnerHTML={{ __html: snarkdown(escapeHtml(markdown)) }}
              />
            )}
            {phase === 'done' && <ReactionBar reaction={reactions.reaction} onReact={reactions.react} />}
          </div>
          <div className="tail" />
        </>
      )}
      <Avatar frame={frame} onActivate={handleActivate} />
    </div>
  )
}
