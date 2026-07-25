// KKday 商品頁評論翻譯：用 Chrome 內建 Translator / LanguageDetector API（全程本機、不上傳）
// 把「其他國家旅客」用原文留的評論，就地翻成閱讀者的語言。
//
// 情境：商品頁每則評論 KKday 其實都有原生「See translation」按鈕，但要一則一則點。
// 這裡提供「一鍵翻譯所有評論」：偵測每則原文語言 → 翻成目標語言 → 附在原文下方。
//
// 設計原則：
// - 只翻「跟目標語言不同」的評論（同語言不用翻，省時也避免 no-op 噪音）。
// - Translator 依「來源→目標」語言對建立，同一對重複使用（cache），不重複下載/建立。
// - 翻譯結果就地插進 KKday 的 DOM（附在原文下方），用 data 屬性標記，能反覆顯示/隱藏。

// 評論卡片內文容器（見實機 DOM：.product-comment-content 內含 title / body / 原生翻譯按鈕）
const COMMENT_CONTENT_SELECTOR = '.product-comment-content'
const COMMENT_BODY_SELECTOR = '.product-comment-content__body'
const COMMENT_TITLE_SELECTOR = '.product-comment-content__title'

// 我們注入的翻譯區塊標記（去重、切換顯示、擷取時排除自己）
export const TRANSLATION_NODE_ATTR = 'data-summarize-ai-translation'
// 標在卡片上：記錄「已翻過的原文」，原文沒變就不重翻
const TRANSLATED_FLAG_ATTR = 'data-summarize-ai-translated-src'

// LanguageDetector 信心門檻：低於此值視為偵測不可靠，保守略過翻譯（不亂翻）
const MIN_DETECT_CONFIDENCE = 0.5

// 內建 AI 模型的可用狀態（對齊 @types/dom-chromium-ai 的 Availability）
export type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available'

// 一則評論翻譯所需的原始素材
export interface ReviewCard {
  el: HTMLElement // .product-comment-content 容器
  body: HTMLElement // 內文節點（翻譯附在它後面）
  title: string // 評論標題（可能為空）
  text: string // 評論正文（純文字）
}

// ── 頁面語系 ────────────────────────────────────────────────
// KKday 是多語系站,使用者「正在看的語言」= 頁面語系（html[lang]，如 en-au / zh-tw）。
// UI 文案與翻譯目標語言都以此為準——不看 navigator.language（那是瀏覽器偏好，與使用者
// 當前實際在讀的頁面無關；否則英文頁會冒出中文按鈕）。
function pageLang(): string {
  return (document.documentElement.lang || navigator.language || 'en').toLowerCase()
}

// ── 目標語言 ────────────────────────────────────────────────
// 翻成閱讀者的語言：以頁面語系為準。Translator 的語言代碼用 BCP-47 主語言（en/zh/ja…），
// 中文維持地區細分（Translator 對 zh 需要 zh-Hant / zh-Hans 才準）。
export function targetLanguage(): string {
  const raw = pageLang()
  if (raw.startsWith('zh')) return raw.includes('cn') || raw.includes('hans') ? 'zh-Hans' : 'zh-Hant'
  return raw.split('-')[0]
}

// ── UI 文案（i18n）────────────────────────────────────────────
// 只做繁中 + 英文兩套，其他語系一律 fallback 到英文（KKday 多語系，全手寫成本不划算）。
// UI 語言依頁面語系判斷：中文頁 → 繁中，其餘 → 英文。
export type UiLang = 'zh-Hant' | 'en'

export interface ReviewTranslateStrings {
  translateAll: string // 「翻譯所有評論」
  showOriginal: string // 「顯示原文」
  showTranslation: string // 「顯示翻譯」
  translating: string // 「翻譯中…」（含準備/下載模型，一律用這句，不對外露實作細節）
  noComments: string // 沒有可翻的評論
  allLocal: string // 全部已是本地語言
  unsupported: string // 裝置不支援內建 AI
  failed: (msg: string) => string // 翻譯失敗
}

const STRINGS: Record<UiLang, ReviewTranslateStrings> = {
  'zh-Hant': {
    translateAll: '翻譯所有評論',
    showOriginal: '顯示原文',
    showTranslation: '顯示翻譯',
    translating: '翻譯中…',
    noComments: '這頁目前沒有可翻譯的評論。',
    allLocal: '這些評論已經是你的語言，不需要翻譯 🎉',
    unsupported: '這台裝置無法使用內建 AI 翻譯（需要 Chrome 138+ 且符合硬體需求）。',
    failed: (msg) => `翻譯失敗：${msg}`,
  },
  en: {
    translateAll: 'Translate all reviews',
    showOriginal: 'Show original',
    showTranslation: 'Show translation',
    translating: 'Translating…',
    noComments: 'No reviews to translate on this page.',
    allLocal: 'These reviews are already in your language 🎉',
    unsupported: 'Built-in AI translation is unavailable on this device (needs Chrome 138+ and supported hardware).',
    failed: (msg) => `Translation failed: ${msg}`,
  },
}

// 依頁面語系挑 UI 文案：中文頁用繁中，其餘一律英文。
export function uiStrings(): ReviewTranslateStrings {
  return pageLang().startsWith('zh') ? STRINGS['zh-Hant'] : STRINGS.en
}

// ── 擷取評論卡片 ────────────────────────────────────────────
// 掃出頁面上目前已載入的評論卡片，取出標題與正文純文字。
// 排除我們自己注入的翻譯節點，避免把譯文又當成原文。
export function collectReviewCards(root: ParentNode = document): ReviewCard[] {
  const cards: ReviewCard[] = []
  for (const el of root.querySelectorAll<HTMLElement>(COMMENT_CONTENT_SELECTOR)) {
    const body = el.querySelector<HTMLElement>(COMMENT_BODY_SELECTOR)
    if (!body) continue
    const title = el.querySelector<HTMLElement>(COMMENT_TITLE_SELECTOR)?.textContent?.trim() ?? ''
    const text = readCardText(body)
    if (!text) continue
    cards.push({ el, body, title, text })
  }
  return cards
}

// 讀評論正文純文字：排除我們注入的譯文節點（clone 後移除，避免動到畫面）
function readCardText(body: HTMLElement): string {
  const injected = body.querySelector(`[${TRANSLATION_NODE_ATTR}]`)
  if (!injected) return (body.textContent || '').trim()
  const clone = body.cloneNode(true) as HTMLElement
  clone.querySelectorAll(`[${TRANSLATION_NODE_ATTR}]`).forEach((n) => n.remove())
  return (clone.textContent || '').trim()
}

// ── 語言偵測 ────────────────────────────────────────────────
// LanguageDetector 是單例（一顆就能偵測所有語言），建立一次重複使用
let detectorPromise: Promise<LanguageDetector> | null = null

// LanguageDetector 是否可用 / 需下載
export async function detectorAvailability(): Promise<Availability> {
  if (typeof LanguageDetector === 'undefined') return 'unavailable'
  return LanguageDetector.availability()
}

// 取得（或建立）LanguageDetector。onProgress 回報模型下載進度（0~1）。
export async function getDetector(onProgress?: (loaded: number) => void): Promise<LanguageDetector> {
  if (detectorPromise) return detectorPromise
  detectorPromise = LanguageDetector.create({
    monitor(m) {
      m.addEventListener('downloadprogress', (e) => onProgress?.(e.loaded))
    },
  })
  try {
    return await detectorPromise
  } catch (err) {
    detectorPromise = null // 失敗不留壞快取
    throw err
  }
}

// 測試用：清掉 LanguageDetector 快取
export function resetDetectorCache(): void {
  detectorPromise = null
}

// 偵測一段文字的語言（BCP-47 主碼）。偵測不到 / 信心不足回 null（保守略過）。
export async function detectLanguage(
  detector: LanguageDetector,
  text: string,
): Promise<string | null> {
  const results = await detector.detect(text)
  const top = results[0]
  if (!top || (top.confidence ?? 0) < MIN_DETECT_CONFIDENCE) return null
  // 'und'（undetermined）代表偵測器沒把握，視為不可翻
  if (!top.detectedLanguage || top.detectedLanguage === 'und') return null
  return top.detectedLanguage
}

// 兩個語言代碼是否為「同一種語言」（只比主碼：en-au 與 en、zh-Hant 與 zh 視為同語言）
export function sameLanguage(a: string, b: string): boolean {
  return a.toLowerCase().split('-')[0] === b.toLowerCase().split('-')[0]
}

// ── Translator 建立與快取 ──────────────────────────────────
// 依「來源→目標」語言對快取 Translator，同一對只建立一次
const translatorCache = new Map<string, Promise<Translator>>()

function pairKey(source: string, target: string): string {
  return `${source}->${target}`
}

// 查某語言對的翻譯是否可用 / 需下載。不支援 API 一律 unavailable。
export async function pairAvailability(source: string, target: string): Promise<Availability> {
  if (typeof Translator === 'undefined') return 'unavailable'
  try {
    return await Translator.availability({ sourceLanguage: source, targetLanguage: target })
  } catch {
    // 不支援的語言對會 throw，視為 unavailable
    return 'unavailable'
  }
}

// 取得（或建立）某語言對的 Translator。onProgress 回報模型下載進度（0~1）。
export async function getTranslator(
  source: string,
  target: string,
  onProgress?: (loaded: number) => void,
): Promise<Translator> {
  const key = pairKey(source, target)
  const cached = translatorCache.get(key)
  if (cached) return cached

  const created = Translator.create({
    sourceLanguage: source,
    targetLanguage: target,
    monitor(m) {
      m.addEventListener('downloadprogress', (e) => onProgress?.(e.loaded))
    },
  })
  translatorCache.set(key, created)
  try {
    return await created
  } catch (err) {
    translatorCache.delete(key) // 失敗不留壞快取，下次可重試
    throw err
  }
}

// 測試用：清掉 Translator 快取
export function resetTranslatorCache(): void {
  translatorCache.clear()
}

// ── 就地注入 / 切換譯文 ────────────────────────────────────
// 把譯文插進評論卡片（附在原文正文後面）。標題若有也一起翻，放在譯文最前面。
// 冪等：同一則已注入且原文沒變就不重插；用 flag 記住「翻的是哪段原文」。
export function injectTranslation(card: ReviewCard, translatedTitle: string, translatedBody: string): void {
  const existing = card.body.querySelector<HTMLElement>(`[${TRANSLATION_NODE_ATTR}]`)
  // 原文沒變（flag 相符）且已有節點 → 顯示即可，不重建
  if (existing && card.el.getAttribute(TRANSLATED_FLAG_ATTR) === card.text) {
    existing.hidden = false
    return
  }
  existing?.remove()

  const node = document.createElement('div')
  node.setAttribute(TRANSLATION_NODE_ATTR, '')

  if (translatedTitle) {
    const t = document.createElement('div')
    t.setAttribute('data-summarize-ai-translation-title', '')
    t.textContent = translatedTitle
    node.appendChild(t)
  }
  const b = document.createElement('div')
  b.textContent = translatedBody
  node.appendChild(b)

  card.body.appendChild(node)
  card.el.setAttribute(TRANSLATED_FLAG_ATTR, card.text)
}

// 顯示 / 隱藏頁面上所有已注入的譯文（切換「顯示翻譯 / 顯示原文」）
export function setTranslationsVisible(visible: boolean, root: ParentNode = document): void {
  for (const node of root.querySelectorAll<HTMLElement>(`[${TRANSLATION_NODE_ATTR}]`)) {
    node.hidden = !visible
  }
}

// 頁面上是否已有注入過的譯文（決定按鈕該顯示「翻譯 / 切回原文」）
export function hasInjectedTranslations(root: ParentNode = document): boolean {
  return root.querySelector(`[${TRANSLATION_NODE_ATTR}]`) !== null
}
