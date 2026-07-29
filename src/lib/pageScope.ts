// 「小夥伴要不要在這一頁運作」的判斷：總開關 + 逐頁停用清單。
//
// popup 的「在這頁停用」把使用者當下看的分頁存成一個 page key，content script 注入前用自己的
// 網址算出同一個 key 去比對。key 的正規化刻意做三件事，讓「同一個頁面」符合使用者的直覺：
//
// - 去掉 `www.` 前綴：`www.kkday.com` 與 `kkday.com` 是同一頁
// - 去掉語系前綴（`/zh-tw`、`/en`）：同一個商品換語言看還是同一頁，不必逐語系各停用一次
// - 丟掉 query 與 hash：同一頁的排序參數、錨點不該算成不同頁
//
// 判斷刻意做成同步的（吃 settings 的記憶體快取），因為注入層要在「建立 UI 之前」就決定，
// 否則停用頁會先閃一下小夥伴才消失。呼叫端負責先 await 一次 getSettings() 補水（見 content.tsx）。

import { getSettingsSync, type Settings } from './settings'

// 語系前綴的形狀：en / zh-tw / zh-hant。只認這個形狀，避免把真的路徑段（/product）當語系吃掉。
const LOCALE_SEG_RE = /^[a-z]{2}(-[a-z]{2,4})?$/i

// 這個 extension 只在 kkday.com（含子網域）運作，其他站的頁面沒有「停用」的意義
const SUPPORTED_HOST = 'kkday.com'

/**
 * 把網址正規化成 page key（`host/path`，host 去掉 www.、path 去掉語系前綴與尾斜線）。
 * @param url 完整網址
 * @returns page key；非 http(s) 或格式不對回 null
 */
export function pageKeyFromUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null // chrome://、about:blank、空字串等
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  const host = parsed.host.replace(/^www\./i, '').toLowerCase()
  const segments = parsed.pathname.split('/').filter(Boolean)
  if (segments.length > 0 && LOCALE_SEG_RE.test(segments[0])) segments.shift()

  return `${host}/${segments.join('/')}`
}

/**
 * 當前頁面的 page key（content script 用）
 */
export function currentPageKey(): string | null {
  return pageKeyFromUrl(location.href)
}

/**
 * 這個 page key 是否落在 extension 的作用範圍內（kkday.com 及其子網域）
 */
export function isSupportedPageKey(key: string): boolean {
  const host = key.split('/')[0]
  return host === SUPPORTED_HOST || host.endsWith(`.${SUPPORTED_HOST}`)
}

/**
 * 這個 page key 是否在停用清單裡
 * @param settings 目前設定
 * @param key page key（null 代表算不出來，視為未停用）
 */
export function isPageDisabled(settings: Settings, key: string | null): boolean {
  return key !== null && settings.disabledPages.includes(key)
}

/**
 * 小夥伴是否該在當前頁面運作：總開關開著、且這頁沒被個別停用。
 * 同步判斷，content script 的注入 / 拆除都以它為準。
 */
export function isBuddyEnabledHere(): boolean {
  const settings = getSettingsSync()
  return settings.enabled && !isPageDisabled(settings, currentPageKey())
}

/**
 * 把 page key 轉成 popup 上顯示的短標籤（只留路徑，首頁特別標示）
 */
export function pageKeyLabel(key: string): string {
  const slash = key.indexOf('/')
  const path = slash === -1 ? '/' : key.slice(slash)
  return path === '/' ? '/（首頁）' : path
}
