import { useCallback, useEffect, useRef, useState } from 'react'

// 思考時被一直點，回一句不耐煩的話（與模式無關，各模式共用）
const IMPATIENT_LINES = [
  '欸，我還在看啦，別催',
  '好啦好啦，馬上就好',
  '再點我也不會變快喔',
  '拜託，讓我專心一下',
  '你越催我會越慢喔 😤',
]

const NAG_HOLD_MS = 2200
// lines 為空時的保底（理論上不會發生，strategy 都會帶台詞）
const FALLBACK_LINES = ['讓我想一下……']

export interface Chatter {
  line: string
  impatient: boolean
  nag: () => void
}

// 思考狀態下輪播碎念台詞；台詞由呼叫端（strategy）提供，hook 不認得任何模式。
// nag() 讓小夥伴回一句不耐煩的話暫時蓋過碎念。
export function useThinkingChatter(active: boolean, thinkingLines: string[]): Chatter {
  const lines = thinkingLines.length ? thinkingLines : FALLBACK_LINES
  const [line, setLine] = useState(lines[0])
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
    setLine(lines[0])
    const timer = setInterval(() => {
      i = (i + 1) % lines.length
      setLine(lines[i])
    }, 2200)
    return () => clearInterval(timer)
  }, [active, lines])

  const nag = useCallback(() => {
    const next = IMPATIENT_LINES[nagIdx.current % IMPATIENT_LINES.length]
    nagIdx.current += 1
    setImpatient(next)
    if (nagTimer.current !== null) clearTimeout(nagTimer.current)
    nagTimer.current = window.setTimeout(() => setImpatient(null), NAG_HOLD_MS)
  }, [])

  return { line: impatient ?? line, impatient: impatient !== null, nag }
}
