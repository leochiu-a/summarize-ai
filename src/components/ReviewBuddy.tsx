import { useCallback, useEffect, useRef, useState } from 'react'
import { useReviewRewrite } from '../hooks/useReviewRewrite'
import { useTypewriter } from '../hooks/useTypewriter'
import { isOpen } from '../lib/buddyPhase'
import { watchReviewDraft } from '../lib/reviewPage'
import { BuddyBubble } from './BuddyBubble'

// 潤飾評論時的碎念，走「陪你把心得寫好」的鼓勵口吻
const THINKING_LINES = [
  '讓我幫你把心得潤一下',
  '嗯……這句我幫你順順看',
  '幫你講得更清楚一點',
  '其他旅客會看到，寫好一點～',
  '再等我一下，快潤好了',
]

// 寫夠這個字數才提供潤飾（先鼓勵使用者自己寫，寫得少不急著代勞）
const REWRITE_THRESHOLD = 45
// 過了這個比例就從「引導」切成「快到了」的鼓勵
const ALMOST_RATIO = 0.5

// 進頁提示（依使用者已寫字數分三段）：
// - 還沒寫 / 寫得少：引導「可以寫什麼」，降低不知從何下筆的卡點
// - 寫到一半：鼓勵「快到了，加油」
// - 寫夠了：告訴他可以幫忙潤飾（按鈕這時才出現）
function promptFor(len: number): { text: string; canRewrite: boolean } {
  if (len >= REWRITE_THRESHOLD) {
    return { text: '寫得很棒！要我幫你潤飾得更順、更好讀嗎？其他旅客會感謝你的 ✨', canRewrite: true }
  }
  if (len >= REWRITE_THRESHOLD * ALMOST_RATIO) {
    return { text: '差不多快到了，再多寫一點點就很完整囉，加油 💪', canRewrite: false }
  }
  return {
    text: '這次體驗如何？先寫下你的真實感受吧～可以聊聊：值不值得、適合誰、有沒有想提醒其他旅客的小地方 ✍️',
    canRewrite: false,
  }
}

// 評論頁「幫你潤飾評論」模式：自己持有 useReviewRewrite。
// 一進頁面就展開，先鼓勵/引導使用者自己寫；寫到 threshold 才出現「幫我想想」按鈕。
// 潤飾完不自動寫回，先顯示結果 + 「套用到評論 / 重新潤飾」，使用者確認才套用。
export function ReviewBuddy({
  onActiveChange,
}: {
  autoStart?: boolean
  onActiveChange?: (active: boolean) => void
}) {
  const review = useReviewRewrite()
  const { phase } = review
  const [draftLen, setDraftLen] = useState(0)

  // 監聽使用者輸入長度。用 debounce(400ms)：連續打字時不更新（提示不抖、打字機不重打），
  // 停筆一下才更新字數 → 切換提示 → buddy 才「回話」。像真人：你在寫時它安靜，你停了它才搭話。
  const debounceRef = useRef<number | null>(null)
  useEffect(() => {
    const stop = watchReviewDraft((len) => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(() => setDraftLen(len), 400)
    })
    return () => {
      stop()
      if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    }
  }, [])

  useEffect(() => {
    onActiveChange?.(isOpen(phase))
  }, [phase, onActiveChange])

  // 點「幫我想想」/ 點頭像 = 潤飾使用者目前寫的評論（點擊是使用者手勢，允許觸發模型下載）
  const onStart = useCallback(() => void review.run({ userInitiated: true }), [review])
  const onRerun = useCallback(() => void review.run({ userInitiated: true }), [review])

  const data = review.data ?? ''
  const idlePrompt = phase === 'idle'
  const awaitingConfirm = phase === 'done'
  const prompt = promptFor(draftLen)
  // 進頁引導文字逐字打出來（像 buddy 在說話）；跨段換句時會重新打一次。
  // 非 idle 時餵空字串，讓打字機停下。
  const typedPrompt = useTypewriter(idlePrompt ? prompt.text : '')

  // 依狀態決定內容下方要放哪些行動按鈕
  const actions =
    idlePrompt && prompt.canRewrite ? (
      // 寫夠了才出現：引導使用者交給 buddy 潤飾
      <button type="button" className="buddy-btn primary" onClick={onStart}>
        幫我想想怎麼寫
      </button>
    ) : awaitingConfirm ? (
      <>
        <button type="button" className="buddy-btn primary" onClick={review.apply}>
          套用到評論
        </button>
        <button type="button" className="buddy-btn ghost" onClick={onRerun}>
          重新潤飾
        </button>
      </>
    ) : undefined

  return (
    <BuddyBubble
      view={{
        phase,
        title: '幫你潤飾評論',
        thinkingLines: THINKING_LINES,
        content: data,
        error: phase === 'error' ? review.error : '',
        fromCache: false,
      }}
      onStart={onStart}
      onClose={review.reset}
      onRerun={onRerun}
      openWhenIdle // 一進評論頁就主動顯示提示
      actions={actions}
      showReactions={false} // 評論潤飾不需要 emoji 反應列
      showRerunButton={false} // 重跑改用 actions 裡的「重新潤飾」
    >
      {idlePrompt ? (
        <div className="thinking-text">{typedPrompt}</div>
      ) : (
        data && <div className="content worth-text">{data}</div>
      )}
    </BuddyBubble>
  )
}
