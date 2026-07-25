// 商品頁評論區的「翻譯所有評論」按鈕。
// 掛在評分列下方、評論列表上方，點一下把目前已載入、非本地語言的評論就地翻成閱讀者的語言；
// 再點一下在「顯示原文 / 顯示翻譯」之間切換。全程本機、不上傳。
//
// 視覺：淡青單色底 + 青→藍漸層文字/icon，呼應商品摘要卡片的漸層標題，讓兩個 AI 功能像同一系列。
// 刻意保持輕巧（小尺寸、無粗邊框），輔助功能不搶主要動線。文案依頁面語系（繁中 / 英文）。

import { useReviewTranslate } from '../hooks/useReviewTranslate'
import { uiStrings } from '../lib/reviewTranslate'

// 依狀態決定按鈕文字。刻意不對外露「下載模型 / 進度數字」這種實作細節——
// 使用者只需要知道「翻譯中」。從按下到翻好，全程顯示同一句，不被下載進度打斷。
function label(state: ReturnType<typeof useReviewTranslate>['state']): string {
  const t = uiStrings()
  switch (state) {
    case 'preparing':
    case 'translating':
      return t.translating
    case 'showing':
      return t.showOriginal
    case 'hidden':
      return t.showTranslation
    default:
      return t.translateAll
  }
}

export function ReviewTranslateButton() {
  const { state, error, toggle } = useReviewTranslate()
  const busy = state === 'preparing' || state === 'translating'

  return (
    <div className="review-translate">
      <button
        type="button"
        className="review-translate__btn"
        onClick={() => void toggle()}
        disabled={busy}
        aria-busy={busy}
      >
        <TranslateIcon />
        <span className="review-translate__label">{label(state)}</span>
      </button>
      {error && <div className="review-translate__error">{error}</div>}
    </div>
  )
}

function TranslateIcon() {
  // 「翻譯」icon（A 字 + 底線）。用漸層填色（青→藍），與文字同一條漸層。
  // 漸層透過 SVG <linearGradient> 上色，id 需唯一避免跟頁面其它 svg 撞。
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" className="review-translate__icon">
      <defs>
        <linearGradient id="summarize-ai-translate-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#10d5e3" />
          <stop offset="50%" stopColor="#2ec4f2" />
          <stop offset="100%" stopColor="#4daaf7" />
        </linearGradient>
      </defs>
      <g fill="url(#summarize-ai-translate-grad)">
        <path d="M16.5 9a.75.75 0 0 1 .67.415l5.25 10.5a.75.75 0 1 1-1.34.67l-4.58-9.158-4.58 9.158a.75.75 0 1 1-1.34-.67l5.25-10.5A.75.75 0 0 1 16.5 9Z" />
        <path d="M12 17.25a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75ZM8.25 2.25A.75.75 0 0 1 9 3v2.25a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75Z" />
        <path d="M1.5 5.25a.75.75 0 0 1 .75-.75h12a.75.75 0 0 1 0 1.5h-12a.75.75 0 0 1-.75-.75Zm9.53 1.72a.75.75 0 0 1 .073 1.058c-1.29 1.474-2.83 2.94-4.35 4.199 1.056.86 2.11 1.575 2.96 2.06a.75.75 0 1 1-.745 1.302c-.98-.56-2.16-1.371-3.32-2.34-1.55 1.2-2.96 2.078-3.79 2.514a.75.75 0 0 1-.696-1.328c.712-.373 1.99-1.164 3.42-2.256-.86-.808-1.64-1.66-2.22-2.5a.75.75 0 0 1 1.234-.852c.54.782 1.29 1.588 2.14 2.36 1.4-1.155 2.79-2.475 3.94-3.79a.75.75 0 0 1 1.058-.073Z" />
      </g>
    </svg>
  )
}
