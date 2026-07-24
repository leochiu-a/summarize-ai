import { useCallback, useEffect, useRef } from 'react'
import snarkdown from 'snarkdown'
import { useSummarizer } from '../hooks/useSummarizer'
import { isOpen } from '../lib/buddyPhase'
import { escapeHtml } from '../lib/summarizer'
import { BuddyBubble } from './BuddyBubble'

// 等待整頁摘要時的碎念，走「讀文章」的口吻
const THINKING_LINES = [
  '讓我看看這頁在講什麼',
  '嗯……這篇好像有點長',
  '等我一下，我快速掃過去',
  '重點好像藏在中間欸',
  '快好了，我整理一下',
  '再給我一秒鐘就好',
]

// 整頁摘要模式：自己持有 useSummarizer，把 phase 映射成外殼要的狀態，內容主體用 Markdown 渲染。
// autoStart=true（每頁自動摘要）時掛載即跑一次；否則靜待使用者點頭像。
// onActiveChange：把「泡泡是否展開」回報給 Buddy（換頁時用來決定可否切模式）。
export function SummaryBuddy({
  autoStart = false,
  onActiveChange,
}: {
  autoStart?: boolean
  onActiveChange?: (active: boolean) => void
}) {
  const summ = useSummarizer()

  const ran = useRef(false)
  useEffect(() => {
    if (!autoStart || ran.current) return
    ran.current = true
    void summ.summarize()
  }, [autoStart, summ])

  useEffect(() => {
    onActiveChange?.(isOpen(summ.phase))
  }, [summ.phase, onActiveChange])

  const onStart = useCallback(() => void summ.summarize(), [summ])
  const onRerun = useCallback(() => void summ.summarize(true), [summ])

  return (
    <BuddyBubble
      view={{
        phase: summ.phase,
        title: '頁面摘要',
        thinkingLines: THINKING_LINES,
        content: summ.markdown,
        error: summ.phase === 'error' ? summ.error : '',
        fromCache: summ.fromCache,
      }}
      onStart={onStart}
      onClose={summ.close}
      onRerun={onRerun}
    >
      {summ.markdown && (
        <div
          className="content"
          dangerouslySetInnerHTML={{ __html: snarkdown(escapeHtml(summ.markdown)) }}
        />
      )}
    </BuddyBubble>
  )
}
