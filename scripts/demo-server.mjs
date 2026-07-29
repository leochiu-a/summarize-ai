// demo 靜態 server（零依賴，node 內建 http 即可）。
//
// 為什麼需要 server 而不是直接開 file://：
// 評論頁功能靠 `isReviewPage()` 比對 location.pathname（/order/comment/<id>），
// file:// 路徑做不出那個形狀，所以評論頁的 UI 在檔案模式下根本不會出現。
//
// 兩個刻意的設計：
// - /content.js 直接讀 dist/content.js，不做複製。省掉「改完程式要記得 cp 到 demo/」這一步，
//   搭配 `pnpm dev`（watch build）就是改完存檔、重新整理即可。
// - 一律回 no-store。原本 demo 頁用 content.js?v=21 手動 bump 擋快取，很容易忘記改。

import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEMO = join(ROOT, 'demo')
const PORT = Number(process.env.PORT ?? 5174)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

// 把 URL 對應到實際檔案。回傳 null = 404。
function resolveFile(pathname) {
  // content script 與 WebMCP 註冊層都直接從 build 產物拿，不用複製到 demo/
  if (pathname === '/content.js' || pathname === '/webmcp.js') {
    const built = join(ROOT, 'dist', pathname.slice(1))
    return existsSync(built) ? built : null
  }

  // 商品頁：真實網址是 /product/<id>（可帶 /zh-tw 前綴）。
  // WebMCP 的 tool 全靠 isProductPage() 決定要不要註冊，所以路徑形狀必須對。
  if (/^(\/[a-z]{2}-[a-z]{2})?\/product\/\d+(-[\w-]+)?\/?$/i.test(pathname)) {
    return join(DEMO, 'product.html')
  }

  // 評論撰寫頁：真實網址是 /order/comment/<訂單編號>（可帶 /zh-tw 前綴），
  // 任何符合這個形狀的路徑都給同一份 review.html，讓 isReviewPage() 命中。
  if (/^(\/[a-z]{2}-[a-z]{2})?\/order\/comment\/[\w-]+\/?$/i.test(pathname)) {
    return join(DEMO, 'review.html')
  }

  const clean = pathname === '/' ? '/index.html' : pathname
  // 無副檔名的短路徑（/probe、/homepage）補上 .html
  const withExt = extname(clean) ? clean : `${clean}.html`
  const file = join(DEMO, normalize(withExt))
  // 防目錄穿越
  if (!file.startsWith(DEMO)) return null
  return existsSync(file) && statSync(file).isFile() ? file : null
}

const server = createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${PORT}`)
  const file = resolveFile(decodeURIComponent(pathname))

  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(
      pathname === '/content.js' || pathname === '/webmcp.js'
        ? `找不到 dist${pathname} —— 先跑 pnpm run build`
        : `404 ${pathname}`,
    )
    return
  }

  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  })
  createReadStream(file).pipe(res)
})

server.listen(PORT, () => {
  const at = (p) => `  http://localhost:${PORT}${p}`
  console.log(`demo server → http://localhost:${PORT}\n`)
  console.log('可以開這幾頁：')
  console.log(`${at('/')}                      文章頁（整頁摘要）`)
  console.log(`${at('/homepage')}              非文章頁（垃圾過濾）`)
  console.log(`${at('/order/comment/25KK268720222')}  評論撰寫頁（潤飾）`)
  console.log(`${at('/zh-tw/product/12319')}     商品頁 + WebMCP tool 檢視器`)
  console.log(`${at('/probe')}                 內建 AI API 探測（不 stub，看真實環境）`)
  console.log('\n改完程式：另一個 terminal 跑 pnpm dev，然後重新整理即可（無快取）。')
})
