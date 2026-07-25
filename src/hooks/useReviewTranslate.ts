// 商品頁「一鍵翻譯所有評論」的協調 hook。
// 流程：讀目前已載入的評論卡片 → 偵測每則語言 → 跟目標語言不同的才翻 → 就地附在原文下方。
// 再點一次按鈕：在「顯示翻譯 / 顯示原文」之間切換（已翻過的不重翻，只切換顯示）。
//
// 設計原則：
// - 全程本機（Chrome 內建 Translator / LanguageDetector），不上傳評論內容。
// - 逐則翻、逐則注入：一則翻好就顯示一則，長列表不會整批卡住畫面。
// - 模型下載要使用者手勢：第一次點按鈕就是手勢，可觸發下載。下載屬實作細節，
//   不對外露進度——preparing / translating 對使用者都只是「翻譯中…」。

import { useCallback, useRef, useState } from 'react'
import {
  type ReviewCard,
  collectReviewCards,
  detectLanguage,
  detectorAvailability,
  getDetector,
  getTranslator,
  injectTranslation,
  pairAvailability,
  sameLanguage,
  setTranslationsVisible,
  targetLanguage,
  uiStrings,
} from '../lib/reviewTranslate'

// idle：尚未翻譯　preparing：偵測/下載模型中　translating：逐則翻譯中
// showing：已翻好且正在顯示譯文　hidden：已翻好但切回原文　error：出錯
export type TranslateState = 'idle' | 'preparing' | 'translating' | 'showing' | 'hidden' | 'error'

export interface ReviewTranslating {
  state: TranslateState
  error: string
  toggle: () => Promise<void> // 主要動作：翻譯 / 切換顯示原文↔譯文
}

export function useReviewTranslate(): ReviewTranslating {
  const [state, setState] = useState<TranslateState>('idle')
  const [error, setError] = useState('')
  // 避免重入（翻譯進行中重複點）
  const runningRef = useRef(false)

  const toggle = useCallback(async () => {
    if (runningRef.current) return

    // 已翻過 → 純切換顯示（不重翻）
    if (state === 'showing') {
      setTranslationsVisible(false)
      setState('hidden')
      return
    }
    if (state === 'hidden') {
      setTranslationsVisible(true)
      setState('showing')
      return
    }

    runningRef.current = true
    setError('')
    setState('preparing')

    try {
      const t = uiStrings()
      const target = targetLanguage()
      const cards = collectReviewCards()
      if (cards.length === 0) {
        setError(t.noComments)
        setState('error')
        return
      }

      // 語言偵測器（單例）。不可用就沒得翻。
      const detAvail = await detectorAvailability()
      if (detAvail === 'unavailable') {
        setError(t.unsupported)
        setState('error')
        return
      }
      // 模型可能需要下載（首次），但不對外露進度——使用者只需看到「翻譯中」。
      const detector = await getDetector()

      // 先偵測每則語言，篩出「跟目標語言不同」且可翻的卡片
      const toTranslate: { card: ReviewCard; source: string }[] = []
      for (const card of cards) {
        const source = await detectLanguage(detector, card.title ? `${card.title}。${card.text}` : card.text)
        if (!source || sameLanguage(source, target)) continue // 偵測不到或同語言 → 不翻
        const avail = await pairAvailability(source, target)
        if (avail === 'unavailable') continue // 這個語言對翻不了 → 略過
        toTranslate.push({ card, source })
      }

      if (toTranslate.length === 0) {
        setError(t.allLocal)
        setState('error')
        return
      }

      setState('translating')

      // 逐則翻譯 + 就地注入（一則好就顯示一則）
      for (const { card, source } of toTranslate) {
        try {
          const translator = await getTranslator(source, target)
          const translatedBody = await translator.translate(card.text)
          const translatedTitle = card.title ? await translator.translate(card.title) : ''
          injectTranslation(card, translatedTitle, translatedBody)
        } catch {
          // 單則翻譯失敗不整批中斷，跳過這則繼續下一則
        }
      }

      setState('showing')
    } catch (err) {
      setError(uiStrings().failed(err instanceof Error ? err.message : String(err)))
      setState('error')
    } finally {
      runningRef.current = false
    }
  }, [state])

  return { state, error, toggle }
}
