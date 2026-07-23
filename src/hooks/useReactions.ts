import { useCallback, useRef, useState } from 'react'
import { REACTIONS } from '../lib/reactions'

const REPLY_HOLD_MS = 1600

export interface ReactionState {
  reaction: { code: string; line: string } | null
  reacting: boolean
  react: (code: string) => void
  reset: () => void
}

// 管理 emoji 反應：react(code) 回一句話並觸發動嘴，再按同一顆換下一句；reset() 清空
export function useReactions(): ReactionState {
  const [reaction, setReaction] = useState<{ code: string; line: string } | null>(null)
  const [reacting, setReacting] = useState(false)
  const idx = useRef<Record<string, number>>({})
  const timer = useRef<number | null>(null)

  const react = useCallback((code: string) => {
    const def = REACTIONS.find((r) => r.code === code)
    if (!def) return
    const i = idx.current[code] ?? 0
    idx.current[code] = i + 1
    setReaction({ code, line: def.lines[i % def.lines.length] })
    setReacting(true)
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setReacting(false), REPLY_HOLD_MS)
  }, [])

  const reset = useCallback(() => setReaction(null), [])

  return { reaction, reacting, react, reset }
}
