import { useCallback, useEffect, useState } from 'react'
import { ConsentBuddy } from './components/ConsentBuddy'
import { SummaryBuddy } from './components/SummaryBuddy'
import { WorthBuddy } from './components/WorthBuddy'
import { geminiNanoAvailabilitySync } from './lib/modelGate'
import { isProductPage, onRouteChange } from './lib/productPage'
import { isReviewPage } from './lib/reviewPage'

// buddy 的兩種工作：
// - worth：商品頁專屬「值不值得買」判斷
// - summary：整頁摘要（其餘頁面的預設）
// 每個模式是一個自足的 component（自己持有 hook、自己實作流程），Buddy 只負責「選誰上場」。
//
// 評論撰寫頁是 'none'：那頁的 AI 功能改成長在評論輸入框下方的一排按鈕
// （見 reviewPageToolbar.ts），寫評論時視線都在框裡，右下角再放一隻寵物只會打斷他。
// 連 consent gate 都不掛——模型沒就緒的提示由工具列自己顯示。
type Mode = 'none' | 'worth' | 'summary'

function modeForPage(): Mode {
  if (isReviewPage()) return 'none'
  if (isProductPage()) return 'worth'
  return 'summary'
}

export function Buddy() {
  // 依頁面選模式；SPA 換頁時更新。泡泡展開中（active）先凍結不換，避免把使用者正在看的內容洗掉。
  const [mode, setMode] = useState<Mode>(modeForPage)
  const [active, setActive] = useState(false)
  // A 組 Gemini Nano consent gate：未就緒前先擋在 ConsentBuddy，同意下載完成後才交棒給功能 buddy。
  // 同步初值：模型已就緒（有快取）就直接放行，連 ConsentBuddy 都不掛 → 零閃現。
  const [gatePassed, setGatePassed] = useState(() => geminiNanoAvailabilitySync() === 'available')
  const onGateReady = useCallback(() => setGatePassed(true), [])

  // SPA 換頁：非展開狀態才切模式（展開中換頁保留當前泡泡）
  useEffect(() => {
    return onRouteChange(() => {
      if (!active) setMode(modeForPage())
    })
  }, [active])

  // 模式 component 回報自己是否 active（開始執行 → true，收合 → false），
  // Buddy 用它決定換頁時可否切模式。
  const onActiveChange = useCallback((v: boolean) => setActive(v), [])

  // 評論撰寫頁完全不出現 buddy（含 consent gate）
  if (mode === 'none') return null

  // base model 未就緒前：先擋 consent gate（同意才下載）。就緒/下載完成後才換上功能 buddy。
  if (!gatePassed) return <ConsentBuddy onReady={onGateReady} />

  if (mode === 'worth') return <WorthBuddy onActiveChange={onActiveChange} />
  return <SummaryBuddy onActiveChange={onActiveChange} />
}
