// content script 在模組載入時就會呼叫 chrome.runtime.getURL（sprite / emoji 路徑），
// 測試環境沒有 chrome，先補一個 stub，讓路徑原樣回傳。
;(globalThis as unknown as { chrome: unknown }).chrome = {
  runtime: { getURL: (path: string) => path },
}
