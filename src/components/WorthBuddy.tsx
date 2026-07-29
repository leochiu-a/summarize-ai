import { useCallback, useEffect, useState } from 'react'
import { useTypewriter } from '../hooks/useTypewriter'
import { useWorthIt } from '../hooks/useWorthIt'
import { isOpen } from '../lib/buddyPhase'
import { BuddyBubble } from './BuddyBubble'
import { EmojiIcon } from './EmojiIcon'

// 等待「值不值得買」判斷時的碎念，走天人交戰、糾結買家吐槽的口吻
const THINKING_LINES = [
  '這個嘛……讓我天人交戰一下',
  '錢包表示有點緊張',
  '到底買不買，容我算算',
  '划不划算，我翻一下評價和價格',
  '先別手滑，我幫你把把關',
  '再等我一下，理智線快接上了',
]

// 展開泡泡但還沒開始時的邀請文字（逐字打出來，像 buddy 在說話）。
// 這裡不放 emoji 字元：全站的 emoji 一律走 EmojiIcon（Noto 資產、hover 有動畫），
// 這句的 🧐 改由下方按鈕呈現。
const IDLE_PROMPT = '想知道這個值不值得下手嗎？我幫你看評分、價格和折扣券'

// 商品頁「值不值得買」模式：自己持有 useWorthIt，內容主體為純文字（保留換行）。
//
// 兩段式觸發（點頭像 → 展開＋預熱 → 按按鈕才判斷）：
// 點頭像只展開泡泡、顯示邀請文字，同時在背景把模型載起來（prepare）；使用者真的想看才按按鈕。
// 有快取時 prepare 會直接把上次結果放出來（phase → done），連按鈕都不用出現。
//
// onActiveChange：把「泡泡是否展開」回報給 Buddy（換頁時用來決定可否切模式）。
// 同 SummaryBuddy，idle 的邀請泡泡不算 active。
export function WorthBuddy({
  onActiveChange,
}: {
  onActiveChange?: (active: boolean) => void
}) {
  const worth = useWorthIt()
  // 使用者點頭像展開了泡泡（但可能還沒開始判斷）。收合時歸零。
  const [opened, setOpened] = useState(false)
  const idle = worth.phase === 'idle'

  useEffect(() => {
    onActiveChange?.(isOpen(worth.phase))
  }, [worth.phase, onActiveChange])

  // 點頭像（泡泡未展開）→ 只展開 + 取快取 / 預熱模型，不跑推論
  const onOpen = useCallback(() => {
    setOpened(true)
    void worth.prepare()
  }, [worth])

  // 點頭像（泡泡已展開）→ 收合並釋放 session
  const onClose = useCallback(() => {
    setOpened(false)
    worth.reset()
  }, [worth])

  const onStart = useCallback(() => void worth.run(), [worth])
  const onRerun = useCallback(() => void worth.run({ force: true }), [worth])

  // 邀請文字逐字打出來；非 idle 時餵空字串讓打字機停下
  const typedPrompt = useTypewriter(idle ? IDLE_PROMPT : '')

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
      onStart={onOpen}
      onClose={onClose}
      onRerun={onRerun}
      openWhenIdle={opened} // 點頭像後即使還在 idle 也展開（顯示邀請 + 按鈕）
      actions={
        idle ? (
          <button type="button" className="buddy-btn primary" onClick={onStart}>
            <EmojiIcon code="1f9d0" />
            幫我看值不值得
          </button>
        ) : undefined
      }
    >
      {idle ? (
        <div className="thinking-text">{typedPrompt}</div>
      ) : (
        data && <div className="content worth-text">{data}</div>
      )}
    </BuddyBubble>
  )
}
