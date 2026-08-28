import { useEffect, useState } from 'react'

// popup 開啟時讀目前分頁的 hostname，讓「在此網站停用」不用手動輸入。
// 讀不到（非 http(s) 頁面、沒有分頁權限……）就回 null，UI 要能處理這個情況。
async function readActiveTabHost(): Promise<string | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url) return null
    return new URL(tab.url).hostname
  } catch {
    return null
  }
}

/** 目前活動分頁的 hostname。undefined = 還沒讀完，null = 讀不到。 */
export function useActiveTabHost(): string | null | undefined {
  const [host, setHost] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    void readActiveTabHost().then((h) => alive && setHost(h))
    return () => {
      alive = false
    }
  }, [])

  return host
}
