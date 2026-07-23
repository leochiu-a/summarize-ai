import { useCallback, useEffect, useRef, useState } from 'react'

// 等待摘要時的碎念，讓他看起來像真的在讀、在想
const THINKING_LINES = [
  '讓我看看這頁在講什麼',
  '嗯……這篇好像有點長',
  '等我一下，我快速掃過去',
  '重點好像藏在中間欸',
  '快好了，我整理一下',
  '再給我一秒鐘就好',
]

// 思考時被一直點，回一句不耐煩的話
const IMPATIENT_LINES = [
  '欸，我還在看啦，別催',
  '好啦好啦，馬上就好',
  '再點我也不會變快喔',
  '拜託，讓我專心一下',
  '你越催我會越慢喔 😤',
]

const NAG_HOLD_MS = 2200

export interface Chatter {
  line: string
  impatient: boolean
  nag: () => void
}

// 思考狀態下：輪播碎念台詞；nag() 讓小夥伴回一句不耐煩的話暫時蓋過碎念
export function useThinkingChatter(active: boolean): Chatter {
  const [line, setLine] = useState(THINKING_LINES[0])
  const [impatient, setImpatient] = useState<string | null>(null)
  const nagIdx = useRef(0)
  const nagTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!active) {
      setImpatient(null)
      if (nagTimer.current !== null) {
        clearTimeout(nagTimer.current)
        nagTimer.current = null
      }
      return
    }
    let i = 0
    setLine(THINKING_LINES[0])
    const timer = setInterval(() => {
      i = (i + 1) % THINKING_LINES.length
      setLine(THINKING_LINES[i])
    }, 2200)
    return () => clearInterval(timer)
  }, [active])

  const nag = useCallback(() => {
    const next = IMPATIENT_LINES[nagIdx.current % IMPATIENT_LINES.length]
    nagIdx.current += 1
    setImpatient(next)
    if (nagTimer.current !== null) clearTimeout(nagTimer.current)
    nagTimer.current = window.setTimeout(() => setImpatient(null), NAG_HOLD_MS)
  }, [])

  return { line: impatient ?? line, impatient: impatient !== null, nag }
}
