import { useCallback, useEffect, useRef, useState } from 'react'
import snarkdown from 'snarkdown'
import { escapeHtml, extractPageText, pickOutputLanguage } from './lib/summarizer'
import { FRAMES } from './styles'

type Phase = 'idle' | 'thinking' | 'speaking' | 'done' | 'error'

const TALK_SEQUENCE = [0, 1, 2, 1] // 閉嘴 → 半開 → 張嘴 → 半開
const SPRITE_URL = chrome.runtime.getURL('assets/sprite.png')

// 等待摘要時的碎念，讓他看起來像真的在讀、在想
const THINKING_LINES = [
  '讓我看看這頁在講什麼',
  '嗯……這篇好像有點長',
  '等我一下，我快速掃過去',
  '重點好像藏在中間欸',
  '快好了，我整理一下',
  '再給我一秒鐘就好',
]

export function Buddy() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [bubbleOpen, setBubbleOpen] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [frame, setFrame] = useState(0)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const busy = phase === 'thinking' || phase === 'speaking'

  // 講話動畫：thinking（碎念）和 speaking（唸摘要）時都在動嘴
  useEffect(() => {
    if (phase !== 'thinking' && phase !== 'speaking') {
      setFrame(0)
      return
    }
    let step = 0
    const timer = setInterval(() => {
      setFrame(TALK_SEQUENCE[step % TALK_SEQUENCE.length])
      step++
    }, 140)
    return () => clearInterval(timer)
  }, [phase])

  // 思考時輪播碎念台詞
  useEffect(() => {
    if (phase !== 'thinking') return
    let i = 0
    setStatusText(THINKING_LINES[0])
    const timer = setInterval(() => {
      i = (i + 1) % THINKING_LINES.length
      setStatusText(THINKING_LINES[i])
    }, 2200)
    return () => clearInterval(timer)
  }, [phase])

  // 串流時自動捲到底
  useEffect(() => {
    const el = bubbleRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [markdown])

  const summarize = useCallback(async () => {
    setBubbleOpen(true)
    setMarkdown('')

    let summarizer: Summarizer | null = null
    try {
      if (typeof Summarizer === 'undefined') {
        setPhase('error')
        setStatusText('這個瀏覽器不支援內建 Summarizer API（需要 Chrome 138+，且裝置符合硬體需求）。')
        return
      }

      const availability = await Summarizer.availability()
      if (availability === 'unavailable') {
        setPhase('error')
        setStatusText('Summarizer 模型在這台裝置上無法使用。')
        return
      }

      setPhase('thinking')

      const createOptions = {
        type: 'key-points' as const,
        format: 'markdown' as const,
        length: 'medium' as const,
      }

      // 部分語言可能不在支援清單，失敗時退回預設輸出語言
      try {
        summarizer = await Summarizer.create({ ...createOptions, outputLanguage: pickOutputLanguage() })
      } catch {
        summarizer = await Summarizer.create(createOptions)
      }

      const text = extractPageText()
      if (text.length < 200) {
        setPhase('error')
        setStatusText('這個頁面的文字內容太少，沒什麼好摘要的。')
        return
      }

      const stream = summarizer.summarizeStreaming(text, {
        context: '這是一個網頁的內文，請整理重點給讀者。',
      })

      // 收到第一個 chunk 才從「思考中」切換成「講話中」
      let raw = ''
      for await (const chunk of stream) {
        raw += chunk
        setPhase('speaking')
        setMarkdown(raw)
      }

      if (!raw) {
        setPhase('error')
        setStatusText('模型沒有產出摘要，換個頁面試試看。')
      } else {
        setPhase('done')
      }
    } catch (err) {
      setPhase('error')
      setStatusText(`摘要失敗：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      summarizer?.destroy()
    }
  }, [])

  const handleAvatarClick = useCallback(() => {
    if (busy) return
    if (bubbleOpen) {
      setBubbleOpen(false)
      setPhase('idle')
      return
    }
    void summarize()
  }, [busy, bubbleOpen, summarize])

  return (
    <div className="buddy">
      {bubbleOpen && phase !== 'idle' && (
        <>
          <div className="bubble" ref={bubbleRef}>
            <div className="title">頁面摘要</div>
            {phase === 'thinking' && <div className="thinking-text">{statusText}</div>}
            {phase === 'error' && <div className="error">{statusText}</div>}
            {(phase === 'speaking' || phase === 'done') && (
              <div
                className="content"
                dangerouslySetInnerHTML={{ __html: snarkdown(escapeHtml(markdown)) }}
              />
            )}
          </div>
          <div className="tail" />
        </>
      )}
      <div className="avatar-wrap">
        <div
          className="avatar"
          role="button"
          tabIndex={0}
          title="點我摘要這個頁面"
          style={{
            backgroundImage: `url("${SPRITE_URL}")`,
            backgroundPosition: `${(frame / (FRAMES - 1)) * 100}% 0`,
          }}
          onClick={handleAvatarClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleAvatarClick()
            }
          }}
        />
      </div>
    </div>
  )
}
