import { useEffect, useState } from 'react'

const TALK_SEQUENCE = [0, 1, 2, 1] // 閉嘴 → 半開 → 張嘴 → 半開

// active 為 true 時輪播嘴型（講話 / 碎念 / 回應 emoji），回傳目前的 sprite 格號
export function useTalkingMouth(active: boolean): number {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    if (!active) {
      setFrame(0)
      return
    }
    let step = 0
    const timer = setInterval(() => {
      setFrame(TALK_SEQUENCE[step % TALK_SEQUENCE.length])
      step++
    }, 140)
    return () => clearInterval(timer)
  }, [active])

  return frame
}
