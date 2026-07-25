import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TRANSLATION_NODE_ATTR,
  collectReviewCards,
  detectLanguage,
  hasInjectedTranslations,
  injectTranslation,
  sameLanguage,
  setTranslationsVisible,
  targetLanguage,
  uiStrings,
} from './reviewTranslate'

// 造一則 KKday 評論卡片 DOM（.product-comment-content 內含 title / body）
function seedCard(title: string, body: string): HTMLElement {
  const card = document.createElement('div')
  card.className = 'product-comment-content'
  card.innerHTML = `
    <div class="product-comment-content__title">${title}</div>
    <div class="product-comment-content__body">${body}</div>
  `
  document.body.appendChild(card)
  return card
}

afterEach(() => {
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('lang')
})

describe('targetLanguage', () => {
  it('中文頁維持地區細分（繁體）', () => {
    document.documentElement.lang = 'zh-tw'
    expect(targetLanguage()).toBe('zh-Hant')
  })

  it('簡體 / 中國大陸判成 zh-Hans', () => {
    document.documentElement.lang = 'zh-cn'
    expect(targetLanguage()).toBe('zh-Hans')
  })

  it('英文頁取主語言碼（en-au → en）', () => {
    document.documentElement.lang = 'en-au'
    expect(targetLanguage()).toBe('en')
  })
})

describe('uiStrings（UI 文案跟頁面語系走，非瀏覽器偏好）', () => {
  it('中文頁 → 繁中文案', () => {
    document.documentElement.lang = 'zh-tw'
    expect(uiStrings().translateAll).toBe('翻譯所有評論')
    expect(uiStrings().showOriginal).toBe('顯示原文')
  })

  it('英文頁 → 英文文案', () => {
    document.documentElement.lang = 'en-au'
    expect(uiStrings().translateAll).toBe('Translate all reviews')
    expect(uiStrings().showOriginal).toBe('Show original')
  })

  it('其他語系（日文頁）→ fallback 英文', () => {
    document.documentElement.lang = 'ja'
    expect(uiStrings().translateAll).toBe('Translate all reviews')
  })

  it('翻譯中文案不對外露下載/進度細節，只有一句「翻譯中」', () => {
    document.documentElement.lang = 'zh-tw'
    expect(uiStrings().translating).toBe('翻譯中…')
    document.documentElement.lang = 'en-au'
    expect(uiStrings().translating).toBe('Translating…')
  })
})

describe('sameLanguage', () => {
  it('只比主碼：en-au 與 en 視為同語言', () => {
    expect(sameLanguage('en-au', 'en')).toBe(true)
    expect(sameLanguage('zh-Hant', 'zh')).toBe(true)
  })

  it('不同主碼為不同語言', () => {
    expect(sameLanguage('ja', 'en')).toBe(false)
    expect(sameLanguage('ko', 'zh-Hant')).toBe(false)
  })
})

describe('collectReviewCards', () => {
  it('掃出卡片並取出標題與正文純文字', () => {
    seedCard('超讚', '這個套票很方便')
    const cards = collectReviewCards()
    expect(cards).toHaveLength(1)
    expect(cards[0].title).toBe('超讚')
    expect(cards[0].text).toBe('這個套票很方便')
  })

  it('沒有正文節點或正文空白的卡片略過', () => {
    const empty = document.createElement('div')
    empty.className = 'product-comment-content'
    empty.innerHTML = `<div class="product-comment-content__title">只有標題</div>`
    document.body.appendChild(empty)
    seedCard('有內文', '正文在這')
    const cards = collectReviewCards()
    expect(cards).toHaveLength(1)
    expect(cards[0].text).toBe('正文在這')
  })

  it('讀正文時排除我們注入的譯文節點（不把譯文當原文）', () => {
    const card = seedCard('標題', '原文內容')
    const body = card.querySelector<HTMLElement>('.product-comment-content__body')!
    const trans = document.createElement('div')
    trans.setAttribute(TRANSLATION_NODE_ATTR, '')
    trans.textContent = 'translated content'
    body.appendChild(trans)

    const cards = collectReviewCards()
    expect(cards[0].text).toBe('原文內容') // 不含 'translated content'
  })
})

describe('detectLanguage', () => {
  const detectorWith = (results: { detectedLanguage?: string; confidence?: number }[]) =>
    ({ detect: vi.fn().mockResolvedValue(results) }) as unknown as LanguageDetector

  it('回傳信心足夠的最高分語言', async () => {
    const det = detectorWith([{ detectedLanguage: 'ja', confidence: 0.9 }])
    expect(await detectLanguage(det, 'こんにちは')).toBe('ja')
  })

  it('信心不足回 null（保守略過）', async () => {
    const det = detectorWith([{ detectedLanguage: 'ja', confidence: 0.2 }])
    expect(await detectLanguage(det, 'x')).toBeNull()
  })

  it("偵測結果為 'und'（沒把握）回 null", async () => {
    const det = detectorWith([{ detectedLanguage: 'und', confidence: 0.99 }])
    expect(await detectLanguage(det, '123')).toBeNull()
  })

  it('沒有任何結果回 null', async () => {
    const det = detectorWith([])
    expect(await detectLanguage(det, '')).toBeNull()
  })
})

describe('injectTranslation / setTranslationsVisible / hasInjectedTranslations', () => {
  it('把譯文（標題+正文）附在正文節點後面', () => {
    seedCard('原標題', '原正文')
    const card = collectReviewCards()[0]
    injectTranslation(card, 'Translated Title', 'Translated body')

    const node = card.body.querySelector(`[${TRANSLATION_NODE_ATTR}]`)!
    expect(node).toBeTruthy()
    expect(node.textContent).toContain('Translated Title')
    expect(node.textContent).toContain('Translated body')
  })

  it('沒有翻譯標題時只放正文', () => {
    seedCard('', '原正文')
    const card = collectReviewCards()[0]
    injectTranslation(card, '', 'body only')
    const node = card.body.querySelector(`[${TRANSLATION_NODE_ATTR}]`)!
    expect(node.querySelector('[data-summarize-ai-translation-title]')).toBeNull()
    expect(node.textContent).toContain('body only')
  })

  it('原文沒變重複注入 → 沿用同一節點（冪等）', () => {
    seedCard('標題', '一樣的原文')
    const card = collectReviewCards()[0]
    injectTranslation(card, 'T', 'first')
    injectTranslation(card, 'T', 'first-again')
    const nodes = card.body.querySelectorAll(`[${TRANSLATION_NODE_ATTR}]`)
    expect(nodes).toHaveLength(1) // 沒有變成兩個
  })

  it('setTranslationsVisible 切換所有譯文的顯示/隱藏', () => {
    seedCard('a', 'aa')
    seedCard('b', 'bb')
    const cards = collectReviewCards()
    cards.forEach((c, i) => injectTranslation(c, '', `t${i}`))

    setTranslationsVisible(false)
    expect([...document.querySelectorAll(`[${TRANSLATION_NODE_ATTR}]`)].every((n) => (n as HTMLElement).hidden)).toBe(true)

    setTranslationsVisible(true)
    expect([...document.querySelectorAll(`[${TRANSLATION_NODE_ATTR}]`)].every((n) => !(n as HTMLElement).hidden)).toBe(true)
  })

  it('hasInjectedTranslations 反映頁面是否已有譯文', () => {
    seedCard('x', 'xx')
    expect(hasInjectedTranslations()).toBe(false)
    injectTranslation(collectReviewCards()[0], '', 'tx')
    expect(hasInjectedTranslations()).toBe(true)
  })
})
