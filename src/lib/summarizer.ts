// 頁面擷取與純邏輯工具
// Summarizer API 的型別由 @types/dom-chromium-ai 提供（tsconfig types 已引入）

export function extractPageText(): string {
  const candidates = [
    document.querySelector('article'),
    document.querySelector('main'),
    document.querySelector('[role="main"]'),
    document.body,
  ].filter(Boolean) as HTMLElement[]

  const source = candidates.find((el) => el.innerText.trim().length > 200) ?? document.body
  const clone = source.cloneNode(true) as HTMLElement
  clone
    .querySelectorAll('script, style, nav, footer, header, aside, noscript, iframe, [aria-hidden="true"]')
    .forEach((el) => el.remove())

  const text = clone.innerText.replace(/\n{3,}/g, '\n\n').trim()
  // Summarizer 有輸入額度限制，過長的頁面截斷處理
  return text.slice(0, 16000)
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function pickOutputLanguage(): string {
  const pageLang = (document.documentElement.lang || navigator.language || 'en').toLowerCase()
  return pageLang.startsWith('zh') ? 'zh-Hant' : pageLang.split('-')[0]
}
