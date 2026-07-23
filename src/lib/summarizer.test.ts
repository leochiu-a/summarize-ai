import { afterEach, describe, expect, it } from 'vitest'
import { escapeHtml, extractContent, extractVisibleText, pickOutputLanguage } from './summarizer'

afterEach(() => {
  document.body.innerHTML = ''
  document.title = ''
  document.documentElement.lang = ''
})

describe('escapeHtml', () => {
  it('跳脫 HTML 特殊字元', () => {
    expect(escapeHtml('<b>a & b</b>')).toBe('&lt;b&gt;a &amp; b&lt;/b&gt;')
  })

  it('順序正確，不會重複跳脫 & ', () => {
    // 先換 & 再換 < >，'<' 只會變成一次 &lt;，不會變 &amp;lt;
    expect(escapeHtml('<')).toBe('&lt;')
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })
})

describe('pickOutputLanguage', () => {
  it('中文頁面回傳 zh-Hant', () => {
    document.documentElement.lang = 'zh-TW'
    expect(pickOutputLanguage()).toBe('zh-Hant')
  })

  it('其他語言取主語言碼', () => {
    document.documentElement.lang = 'en-US'
    expect(pickOutputLanguage()).toBe('en')
  })
})

describe('extractVisibleText', () => {
  it('保留內文、濾掉框架資料與導覽/頁尾/彈窗/隱藏元素', () => {
    document.body.innerHTML = `
      <nav>NAV_導覽 東京 大阪 首爾</nav>
      <div role="dialog">COOKIE_同意彈窗</div>
      <div style="display:none">HIDDEN_隱藏塞字</div>
      <div aria-hidden="true">ARIA_隱藏</div>
      <main>
        <h1>CONTENT_主標題</h1>
        <p>CONTENT_這是正文段落，應該被保留下來。</p>
      </main>
      <footer>FOOTER_版權所有</footer>
      <script type="application/json">{"x":"JSON_框架垃圾"}</script>
      <script>window.__NUXT__ = 'INLINE_垃圾'</script>
    `
    const text = extractVisibleText()

    expect(text).toContain('CONTENT_主標題')
    expect(text).toContain('CONTENT_這是正文段落')

    for (const garbage of [
      'NAV_導覽',
      'COOKIE_同意彈窗',
      'HIDDEN_隱藏塞字',
      'ARIA_隱藏',
      'FOOTER_版權所有',
      'JSON_框架垃圾',
      'INLINE_垃圾',
    ]) {
      expect(text).not.toContain(garbage)
    }
  })

  it('壓掉多餘空白與連續空行', () => {
    document.body.innerHTML = '<p>a</p>\n\n\n\n<p>b</p>'
    expect(extractVisibleText()).not.toMatch(/\n{3,}/)
  })
})

describe('extractContent', () => {
  it('文章頁用 Readability 抽出正文', () => {
    document.title = '一篇測試文章'
    const paragraph =
      '這是一篇夠長的測試文章，用來確認 Readability 能正確抽出主要內文。' +
      '內容需要有足夠的字數與句子，模擬真實文章的樣子，讓抽取器判定這是值得閱讀的正文段落。'
    document.body.innerHTML = `
      <nav>導覽列不應出現</nav>
      <article>
        <h1>文章標題</h1>
        <p>${paragraph}</p>
        <p>${paragraph}</p>
        <p>${paragraph}</p>
      </article>
      <footer>頁尾不應出現</footer>
    `
    const result = extractContent()

    expect(result).not.toBeNull()
    expect(result!.text).toContain('Readability 能正確抽出主要內文')
    expect(result!.text).not.toContain('導覽列不應出現')
    expect(result!.text).not.toContain('頁尾不應出現')
  })

  it('整頁幾乎沒有文字時回傳 null', () => {
    document.body.innerHTML = '<div>短</div>'
    expect(extractContent()).toBeNull()
  })

  it('截斷在額度上限內', () => {
    document.body.innerHTML = `<article><p>${'字'.repeat(30000)}</p></article>`
    const result = extractContent()
    expect(result).not.toBeNull()
    expect(result!.text.length).toBeLessThanOrEqual(16000)
  })
})
