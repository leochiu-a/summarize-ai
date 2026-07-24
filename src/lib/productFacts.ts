// 商品「值不值得買」判斷所需的事實蒐集。
// 主來源：頁面 JSON-LD（schema.org Product）——比抓 Vue class 穩定太多，改版不會壞，
//         而且評分 / 評論數 / 價格都是乾淨的數字，模型不用自己 parse（本機模型算數不可靠）。
// 補來源：DOM 上 JSON-LD 沒有的東西（折扣券、銷量、促銷碼）——抓不到就省略，絕不 throw。

export interface ProductOffer {
  name?: string
  price?: number
  availability?: string // e.g. 'InStock'
}

export interface ProductFacts {
  name?: string
  description?: string
  category?: string
  rating?: number // ratingValue，例 4.83
  ratingCount?: number // reviewCount，例 7228
  bestRating?: number // 通常 5
  lowPrice?: number
  highPrice?: number
  currency?: string // e.g. 'TWD'
  offers: ProductOffer[] // 各方案（實體/電子…）
  cancelPolicy?: string // 取消 / 退款政策（MerchantReturnPolicy）
  // ── DOM 補充（best-effort，可能為空）──
  coupons: string[] // 折扣券面額，例 ['TWD 200', 'TWD 600']
  sales?: string // 銷量文字，例 '已售出 100K+'
  promo?: string // 促銷碼文字，例 '結帳輸入APP90 滿$1,500現折$90'
}

// 把 @type 正規化成字串陣列（schema.org 允許字串或陣列）
function typesOf(node: unknown): string[] {
  if (!node || typeof node !== 'object') return []
  const t = (node as Record<string, unknown>)['@type']
  if (typeof t === 'string') return [t]
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string')
  return []
}

// 把單一 JSON-LD payload 攤平成節點清單：payload 可能是物件、陣列，或帶 @graph 的物件。
function flattenNodes(payload: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const visit = (v: unknown) => {
    if (Array.isArray(v)) {
      v.forEach(visit)
    } else if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>
      out.push(obj)
      if (Array.isArray(obj['@graph'])) obj['@graph'].forEach(visit)
    }
  }
  visit(payload)
  return out
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.]/g, ''))
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function toStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

// schema.org availability 常是完整 URL（.../InStock），取尾段即可
function shortAvailability(v: unknown): string | undefined {
  const s = toStr(v)
  return s ? s.split('/').pop() : undefined
}

// 解析 JSON-LD 文字（多個 <script> 內容），回傳合併後的商品事實（無 Product 則回 null）。
// 匯出供測試：不依賴 DOM。
export function parseProductLd(ldTexts: string[]): Partial<ProductFacts> | null {
  const nodes: Record<string, unknown>[] = []
  for (const text of ldTexts) {
    try {
      nodes.push(...flattenNodes(JSON.parse(text)))
    } catch {
      /* 壞掉的 JSON-LD 略過 */
    }
  }

  const product = nodes.find((n) => typesOf(n).includes('Product'))
  if (!product) return null

  const facts: Partial<ProductFacts> = {}
  facts.name = toStr(product.name)
  facts.description = toStr(product.description)
  facts.category = toStr(product.category)

  const agg = product.aggregateRating as Record<string, unknown> | undefined
  if (agg) {
    facts.rating = toNumber(agg.ratingValue)
    facts.ratingCount = toNumber(agg.reviewCount) ?? toNumber(agg.ratingCount)
    facts.bestRating = toNumber(agg.bestRating)
  }

  const offers = product.offers as Record<string, unknown> | undefined
  if (offers) {
    facts.lowPrice = toNumber(offers.lowPrice) ?? toNumber(offers.price)
    facts.highPrice = toNumber(offers.highPrice)
    facts.currency = toStr(offers.priceCurrency)
    const list = offers.offers
    if (Array.isArray(list)) {
      facts.offers = list
        .map((o) => {
          const off = o as Record<string, unknown>
          return {
            name: toStr(off.name),
            price: toNumber(off.price),
            availability: shortAvailability(off.availability),
          }
        })
        .filter((o) => o.name || o.price != null)
    }
  }

  // 取消 / 退款政策：優先 Product.hasMerchantReturnPolicy，退回 @graph 內獨立的 MerchantReturnPolicy 節點
  const policyNode =
    (product.hasMerchantReturnPolicy as Record<string, unknown> | undefined) ??
    nodes.find((n) => typesOf(n).includes('MerchantReturnPolicy'))
  if (policyNode) {
    facts.cancelPolicy = toStr(policyNode.description) ?? toStr(policyNode.name)
  }

  return facts
}

// 從目前頁面讀取所有 JSON-LD script 的內容
function readLdTexts(): string[] {
  return [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map((s) => s.textContent || '')
    .filter(Boolean)
}

// DOM 補充：JSON-LD 沒有的折扣券 / 銷量 / 促銷碼。抓不到就回空，永不 throw。
export function readDomExtras(doc: Document = document): Pick<
  ProductFacts,
  'coupons' | 'sales' | 'promo'
> {
  const extras: Pick<ProductFacts, 'coupons' | 'sales' | 'promo'> = { coupons: [] }
  try {
    // 折扣券面額（券票卡片）
    const coupons = [...doc.querySelectorAll('.coupon-ticket__content')]
      .map((el) => (el.textContent || '').trim())
      .filter((t) => /TWD|NT\$|\d/.test(t))
    extras.coupons = [...new Set(coupons)] // 頁面常重複渲染，去重

    // 銷量：優先商品評分區塊內，退回全頁文字反查
    const inScore = doc
      .querySelector('.product-score')
      ?.textContent?.match(/已售出?\s*[\d.,]+\s*[KkMm]?\+?/)
    const anywhere = inScore
      ? null
      : (doc.body?.textContent || '').match(/已售出\s*[\d.,]+\s*[KkMm]?\+?/)
    const sales = (inScore?.[0] ?? anywhere?.[0])?.replace(/\s+/g, ' ').trim()
    if (sales) extras.sales = sales

    // 促銷碼（滿額折扣等）
    const promoEl =
      doc.querySelector('.promotion__text') ??
      [...doc.querySelectorAll('.kk-tag')].find((el) => /\b[A-Z]{2,}\d+\b|滿.*現折|現折/.test(el.textContent || ''))
    const promo = promoEl?.textContent?.replace(/\s+/g, ' ').trim()
    if (promo) extras.promo = promo
  } catch {
    /* DOM 結構不如預期時，補充資料整組略過即可 */
  }
  return extras
}

// 蒐集完整商品事實（JSON-LD 主 + DOM 補充）。沒有 Product JSON-LD 就回 null。
export function readProductFacts(): ProductFacts | null {
  const base = parseProductLd(readLdTexts())
  if (!base) return null
  // offers 預設空陣列（JSON-LD 可能沒有 offers），coupons 由 readDomExtras 一定提供
  return {
    offers: [],
    ...base,
    ...readDomExtras(),
  }
}
