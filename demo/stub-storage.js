// demo 用的 chrome.storage.local stub（記憶體版）+ 開關小工具。
//
// 為什麼需要：小夥伴的總開關與逐頁停用清單存在 chrome.storage.local，demo 沒有 extension
// runtime，沒有這支 stub 的話設定永遠是預設值（開著），開關那條路徑就完全試不到。
// 這裡也把 onChanged 廣播做出來，才測得到「popup 一存檔、已開啟的頁面立刻套用」那條路徑
// —— 那是這個功能最容易壞的地方（要就地拆掉已注入的 UI，不是等重新整理）。
//
// 這支 stub 必須在 /content.js 之前載入：settings.ts 在模組載入時就會掛 storage.onChanged。
;(() => {
  window.chrome = window.chrome || {}
  if (chrome.storage) return // 真的 extension 環境不要蓋掉

  const store = {}
  const listeners = []

  chrome.storage = {
    local: {
      get: async (key) => (key in store ? { [key]: store[key] } : {}),
      set: async (items) => {
        const changes = {}
        for (const [k, v] of Object.entries(items)) {
          changes[k] = { oldValue: store[k], newValue: v }
          store[k] = v
        }
        for (const cb of [...listeners]) cb(changes, 'local')
      },
    },
    onChanged: {
      addListener: (cb) => listeners.push(cb),
      removeListener: (cb) => {
        const i = listeners.indexOf(cb)
        if (i !== -1) listeners.splice(i, 1)
      },
    },
  }

  // demo 頁沒有 popup，所以在 console 開一個等價的入口：
  //   buddyDemo.off()               關掉總開關 → 小夥伴與注入的 UI 應該就地消失
  //   buddyDemo.on()                開回來 → 應該就地回來（不必重新整理）
  //   buddyDemo.disableThisPage()   只停用這一頁
  //   buddyDemo.reset()             清空設定
  //   buddyDemo.settings()          看目前存了什麼
  const patch = async (p) => {
    await chrome.storage.local.set({ settings: { ...(store.settings ?? {}), ...p } })
    return store.settings
  }

  // pageKeyFromUrl() 的 demo 版粗略複製（去 www.、去語系前綴、丟 query/hash）。
  // 正式判斷在 src/lib/pageScope.ts，這裡只是為了在 console 算出同一把 key。
  const pageKey = () => {
    const host = location.host.replace(/^www\./i, '').toLowerCase()
    const segs = location.pathname.split('/').filter(Boolean)
    if (segs.length && /^[a-z]{2}(-[a-z]{2,4})?$/i.test(segs[0])) segs.shift()
    return `${host}/${segs.join('/')}`
  }

  window.buddyDemo = {
    pageKey,
    settings: () => store.settings ?? '(未設定，使用預設值)',
    on: () => patch({ enabled: true }),
    off: () => patch({ enabled: false }),
    disableThisPage: () => {
      const list = store.settings?.disabledPages ?? []
      const key = pageKey()
      return patch({ disabledPages: list.includes(key) ? list : [...list, key] })
    },
    enableThisPage: () => {
      const list = store.settings?.disabledPages ?? []
      return patch({ disabledPages: list.filter((p) => p !== pageKey()) })
    },
    reset: () => patch({ enabled: true, disabledPages: [] }),
  }

  console.info(
    '[summarize-ai/demo] chrome.storage stub 就緒。試開關：buddyDemo.off() / buddyDemo.on() / buddyDemo.disableThisPage()',
  )
})()
