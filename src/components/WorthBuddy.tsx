import { useCallback, useEffect, useRef } from 'react'
import { useWorthIt } from '../hooks/useWorthIt'
import { isOpen } from '../lib/buddyPhase'
import { BuddyBubble } from './BuddyBubble'

// 等待「值不值得買」判斷時的碎念，走天人交戰、糾結買家吐槽的口吻
const THINKING_LINES = [
  '這個嘛……讓我天人交戰一下',
  '錢包表示有點緊張',
  '到底買不買，容我算算',
  '划不划算，我翻一下評價和價格',
  '先別手滑，我幫你把把關',
  '再等我一下，理智線快接上了',
]

// 商品頁「值不值得買」模式：自己持有 useWorthIt，內容主體為純文字（保留換行）。
// autoStart=true（每頁自動）時掛載即跑，且不強制下載模型（userInitiated=false）；
// 使用者點頭像則是手勢，允許在需要時觸發模型下載。
// onActiveChange：把「泡泡是否展開」回報給 Buddy（換頁時用來決定可否切模式）。
export function WorthBuddy({
  autoStart = false,
  onActiveChange,
}: {
  autoStart?: boolean
  onActiveChange?: (active: boolean) => void
}) {
  const worth = useWorthIt()

  const ran = useRef(false)
  useEffect(() => {
    if (!autoStart || ran.current) return
    ran.current = true
    void worth.run({ userInitiated: false })
  }, [autoStart, worth])

  useEffect(() => {
    onActiveChange?.(isOpen(worth.phase))
  }, [worth.phase, onActiveChange])

  const onStart = useCallback(() => void worth.run({ userInitiated: true }), [worth])
  const onRerun = useCallback(() => void worth.run({ force: true, userInitiated: true }), [worth])

  const data = worth.data ?? ''

  return (
    <BuddyBubble
      view={{
        phase: worth.phase,
        title: '值不值得買',
        thinkingLines: THINKING_LINES,
        content: data,
        error: worth.phase === 'error' ? worth.error : '',
        fromCache: worth.fromCache,
      }}
      onStart={onStart}
      onClose={worth.reset}
      onRerun={onRerun}
    >
      {data && <div className="content worth-text">{data}</div>}
    </BuddyBubble>
  )
}
