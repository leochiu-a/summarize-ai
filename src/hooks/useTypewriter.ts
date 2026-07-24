import { useEffect, useState } from 'react'

// 讓文字像 buddy 逐字打出來（打字/說話感）。text 改變就從頭重打新的那句。
// 用在 review 進頁引導：提示會隨字數在幾段之間切換，換句時重新打一次。
export function useTypewriter(text: string, speedMs = 45): string {
  const [shown, setShown] = useState('')

  useEffect(() => {
    setShown('')
    if (!text) return
    let i = 0
    const timer = setInterval(() => {
      i += 1
      setShown(text.slice(0, i))
      if (i >= text.length) clearInterval(timer)
    }, speedMs)
    return () => clearInterval(timer)
  }, [text, speedMs])

  return shown
}
