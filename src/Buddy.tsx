import { useCallback, useEffect, useState } from 'react'
import { SummaryBuddy } from './components/SummaryBuddy'
import { WorthBuddy } from './components/WorthBuddy'
import { isProductPage, onRouteChange } from './lib/productPage'
import { getSettings } from './lib/settings'

// buddy 的兩種工作：
// - summary：整頁摘要（非商品頁的預設）
// - worth：商品頁專屬「值不值得買」判斷
// 每個模式是一個自足的 component（自己持有 hook、自己實作流程），Buddy 只負責「選誰上場」。
type Mode = 'summary' | 'worth'

function modeForPage(): Mode {
  return isProductPage() ? 'worth' : 'summary'
}

export function Buddy() {
  // 依頁面選模式；SPA 換頁時更新。泡泡展開中（active）先凍結不換，避免把使用者正在看的內容洗掉。
  const [mode, setMode] = useState<Mode>(modeForPage)
  const [active, setActive] = useState(false)
  const [autoStart, setAutoStart] = useState(false)

  // 每頁自動摘要：載入時讀設定，決定掛載即自動跑一次
  useEffect(() => {
    void getSettings().then((s) => {
      if (s.autoRun) setAutoStart(true)
    })
  }, [])

  // SPA 換頁：非展開狀態才切模式（展開中換頁保留當前泡泡）
  useEffect(() => {
    return onRouteChange(() => {
      if (!active) setMode(modeForPage())
    })
  }, [active])

  // 模式 component 回報自己是否 active（開始執行 → true，收合 → false），
  // Buddy 用它決定換頁時可否切模式。
  const onActiveChange = useCallback((v: boolean) => setActive(v), [])

  return mode === 'worth' ? (
    <WorthBuddy autoStart={autoStart} onActiveChange={onActiveChange} />
  ) : (
    <SummaryBuddy autoStart={autoStart} onActiveChange={onActiveChange} />
  )
}
