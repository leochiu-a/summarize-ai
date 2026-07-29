import { useEffect, useState } from 'react'
import { isSupportedPageKey, pageKeyFromUrl } from '../lib/pageScope'

export interface CurrentTabPage {
  loading: boolean
  // 當前分頁的 page key；拿不到網址、或不是 kkday 頁面時為 null（UI 改顯示提示）
  key: string | null
}

/**
 * popup 專用：讀「使用者正在看的那個分頁」的 page key，給「在這頁停用」用。
 *
 * chrome.tabs.query 只在 host permission 對得上時才回傳 url（manifest 已宣告 kkday.com），
 * 所以其他網站的分頁本來就拿不到網址；再加一層 isSupportedPageKey 過濾，避免使用者把
 * 「小夥伴根本不會跑的頁面」加進停用清單。
 */
export function useCurrentTabPage(): CurrentTabPage {
  const [state, setState] = useState<CurrentTabPage>({ loading: true, key: null })

  useEffect(() => {
    let alive = true
    void queryCurrentPageKey().then((key) => {
      if (alive) setState({ loading: false, key })
    })
    return () => {
      alive = false
    }
  }, [])

  return state
}

async function queryCurrentPageKey(): Promise<string | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    const key = tab?.url ? pageKeyFromUrl(tab.url) : null
    return key !== null && isSupportedPageKey(key) ? key : null
  } catch {
    return null // 權限不足 / 分頁已關閉：當成「沒有可停用的頁面」
  }
}
