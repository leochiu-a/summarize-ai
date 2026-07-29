import { useCallback, useEffect, useState } from 'react'
import snarkdown from 'snarkdown'
import { useSummarizer } from '../hooks/useSummarizer'
import { useTypewriter } from '../hooks/useTypewriter'
import { isOpen } from '../lib/buddyPhase'
import { escapeHtml } from '../lib/summarizer'
import { BuddyBubble } from './BuddyBubble'
import { EmojiIcon } from './EmojiIcon'

// 等待整頁摘要時的碎念，走「讀文章」的口吻
const THINKING_LINES = [
  '讓我看看這頁在講什麼',
  '嗯……這篇好像有點長',
  '等我一下，我快速掃過去',
  '重點好像藏在中間欸',
  '快好了，我整理一下',
  '再給我一秒鐘就好',
]

// 展開泡泡但還沒開始時的邀請文字（逐字打出來，像 buddy 在說話）
const IDLE_PROMPT = '要我幫你把這頁的重點抓出來嗎？'

// 整頁摘要模式：自己持有 useSummarizer，把 phase 映射成外殼要的狀態，內容主體用 Markdown 渲染。
//
// 兩段式觸發（點頭像 → 展開＋預熱 → 按按鈕才摘要）：
// 點頭像只展開泡泡、顯示邀請文字，同時在背景把模型載起來（prepare）；使用者真的想看才按按鈕。
// 這樣「只是好奇點一下」不會白跑一次推論，而按下按鈕時 cold start 已經被預熱吃掉。
// 有快取時 prepare 會直接把上次結果放出來（phase → done），連按鈕都不用出現。
//
// onActiveChange：把「泡泡是否展開」回報給 Buddy（換頁時用來決定可否切模式）。
// 這裡刻意只回報 isOpen(phase)：idle 的邀請泡泡不算 active，SPA 換頁時模式照切、提示收起
// （頁面都換了，那句邀請已經沒意義）。
export function SummaryBuddy({
  onActiveChange,
}: {
  onActiveChange?: (active: boolean) => void
}) {
  const summ = useSummarizer()
  // 使用者點頭像展開了泡泡（但可能還沒開始摘要）。收合時歸零。
  const [opened, setOpened] = useState(false)
  const idle = summ.phase === 'idle'

  useEffect(() => {
    onActiveChange?.(isOpen(summ.phase))
  }, [summ.phase, onActiveChange])

  // 點頭像（泡泡未展開）→ 只展開 + 取快取 / 預熱模型，不跑推論
  const onOpen = useCallback(() => {
    setOpened(true)
    void summ.prepare()
  }, [summ])

  // 點頭像（泡泡已展開）→ 收合並釋放 session
  const onClose = useCallback(() => {
    setOpened(false)
    summ.close()
  }, [summ])

  // 按按鈕才真的摘要；重做則略過快取（兩者都是使用者手勢）
  const onStart = useCallback(() => void summ.summarize(), [summ])
  const onRerun = useCallback(() => void summ.summarize({ force: true }), [summ])

  // 邀請文字逐字打出來；非 idle 時餵空字串讓打字機停下
  const typedPrompt = useTypewriter(idle ? IDLE_PROMPT : '')

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
      onStart={onOpen}
      onClose={onClose}
      onRerun={onRerun}
      openWhenIdle={opened} // 點頭像後即使還在 idle 也展開（顯示邀請 + 按鈕）
      actions={
        idle ? (
          <button type="button" className="buddy-btn primary" onClick={onStart}>
            <EmojiIcon code="1f440" />
            幫我摘要這頁
          </button>
        ) : undefined
      }
    >
      {idle ? (
        <div className="thinking-text">{typedPrompt}</div>
      ) : (
        summ.markdown && (
          <div
            className="content"
            dangerouslySetInnerHTML={{ __html: snarkdown(escapeHtml(summ.markdown)) }}
          />
        )
      )}
    </BuddyBubble>
  )
}
