import { afterEach, describe, expect, it } from 'vitest'
import {
  currentPageKey,
  isBuddyEnabledHere,
  isPageDisabled,
  isSupportedPageKey,
  pageKeyFromUrl,
  pageKeyLabel,
} from './pageScope'
import { DEFAULT_SETTINGS, resetSettingsCache, saveSettings, type Settings } from './settings'

afterEach(() => {
  resetSettingsCache()
})

// jsdom 預設在 http://localhost，改網址用 history.replaceState（同 origin 才行）
function gotoPath(path: string) {
  history.replaceState(null, '', path)
}

const settingsWith = (patch: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...patch })

describe('pageKeyFromUrl', () => {
  it('key 是 host + path', () => {
    expect(pageKeyFromUrl('https://www.kkday.com/zh-tw/product/12345')).toBe(
      'kkday.com/product/12345',
    )
  })

  it('去掉 www.，讓 www.kkday.com 與 kkday.com 算同一頁', () => {
    expect(pageKeyFromUrl('https://www.kkday.com/product/1')).toBe(
      pageKeyFromUrl('https://kkday.com/product/1'),
    )
  })

  it('去掉語系前綴，讓同一個商品換語言看還是同一頁', () => {
    const zh = pageKeyFromUrl('https://www.kkday.com/zh-tw/product/12345')
    const en = pageKeyFromUrl('https://www.kkday.com/en/product/12345')
    const none = pageKeyFromUrl('https://www.kkday.com/product/12345')
    expect(zh).toBe(en)
    expect(zh).toBe(none)
  })

  it('不會把真的路徑段誤當成語系吃掉', () => {
    // product / order 都不符合語系形狀（2 碼 或 2-2~4 碼），必須整段留下
    expect(pageKeyFromUrl('https://kkday.com/product/1')).toBe('kkday.com/product/1')
    expect(pageKeyFromUrl('https://kkday.com/order/comment/25KK268720222')).toBe(
      'kkday.com/order/comment/25KK268720222',
    )
  })

  it('query 與 hash 不進 key（同一頁的排序參數、錨點不算不同頁）', () => {
    expect(pageKeyFromUrl('https://kkday.com/product/1?sort=hot#reviews')).toBe(
      'kkday.com/product/1',
    )
  })

  it('尾斜線正規化掉', () => {
    expect(pageKeyFromUrl('https://kkday.com/product/1/')).toBe('kkday.com/product/1')
  })

  it('首頁的 key 以斜線結尾', () => {
    expect(pageKeyFromUrl('https://www.kkday.com/')).toBe('kkday.com/')
    expect(pageKeyFromUrl('https://www.kkday.com/zh-tw')).toBe('kkday.com/')
  })

  it('大小寫不同的 host 算同一頁', () => {
    expect(pageKeyFromUrl('https://WWW.KKday.com/product/1')).toBe('kkday.com/product/1')
  })

  it('非 http(s) 與壞網址回 null', () => {
    expect(pageKeyFromUrl('chrome://extensions')).toBeNull()
    expect(pageKeyFromUrl('about:blank')).toBeNull()
    expect(pageKeyFromUrl('')).toBeNull()
    expect(pageKeyFromUrl('not a url')).toBeNull()
  })
})

describe('isSupportedPageKey', () => {
  it('認得 kkday.com 與其子網域', () => {
    expect(isSupportedPageKey('kkday.com/product/1')).toBe(true)
    expect(isSupportedPageKey('image.kkday.com/a')).toBe(true)
  })

  it('擋掉其他站（包含把 kkday.com 當後綴的釣魚網域）', () => {
    expect(isSupportedPageKey('example.com/product/1')).toBe(false)
    expect(isSupportedPageKey('notkkday.com/a')).toBe(false)
    expect(isSupportedPageKey('kkday.com.evil.tw/a')).toBe(false)
  })
})

describe('isPageDisabled', () => {
  it('清單裡的頁面算停用', () => {
    const s = settingsWith({ disabledPages: ['kkday.com/product/1'] })
    expect(isPageDisabled(s, 'kkday.com/product/1')).toBe(true)
    expect(isPageDisabled(s, 'kkday.com/product/2')).toBe(false)
  })

  it('算不出 key（null）時視為未停用', () => {
    expect(isPageDisabled(settingsWith({ disabledPages: ['kkday.com/a'] }), null)).toBe(false)
  })
})

describe('isBuddyEnabledHere', () => {
  it('預設（總開關開、清單空）在任何頁面都運作', async () => {
    await saveSettings({})
    gotoPath('/product/12345')
    expect(isBuddyEnabledHere()).toBe(true)
  })

  it('總開關關閉時，任何頁面都不運作', async () => {
    await saveSettings({ enabled: false })
    gotoPath('/product/12345')
    expect(isBuddyEnabledHere()).toBe(false)
  })

  it('只停用當前頁面，其他頁面照常運作', async () => {
    gotoPath('/product/12345')
    await saveSettings({ disabledPages: [currentPageKey()!] })
    expect(isBuddyEnabledHere()).toBe(false)

    gotoPath('/product/99999')
    expect(isBuddyEnabledHere()).toBe(true)
  })

  it('停用一次就跨語系生效（不必逐語系各停用一次）', async () => {
    gotoPath('/zh-tw/product/12345')
    await saveSettings({ disabledPages: [currentPageKey()!] })

    gotoPath('/en/product/12345')
    expect(isBuddyEnabledHere()).toBe(false)
  })
})

describe('pageKeyLabel', () => {
  it('只顯示路徑，不顯示 host', () => {
    expect(pageKeyLabel('kkday.com/product/12345')).toBe('/product/12345')
  })

  it('首頁特別標示', () => {
    expect(pageKeyLabel('kkday.com/')).toBe('/（首頁）')
  })
})
