# Chrome Web Store 上架文案

複製到開發者後台（[Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)）
對應欄位時，請貼「純文字」版本（下方 code block 內），不要連 Markdown 語法一起貼上去
——商店欄位不會渲染 `**`/`*`，會直接顯示星號。

---

## 簡短描述（Short description，上限 132 字元）

目前 58 字元，在上限內：

```text
在網頁右下角召喚 pixel 小夥伴，用 Chrome 內建 AI 幫你摘要頁面內容——語氣任選，全程本機運算不上傳
```

## 詳細描述（Detailed description）

```text
在網頁右下角召喚一個會碎念、會動嘴講話的 pixel 小夥伴，點一下就用 Chrome 瀏覽器內建的 AI（Summarizer API）幫你把目前頁面整理成摘要。不管是落落長的文章，還是資訊爆炸的列表頁，都能快速抓到重點。

【功能特色】

• 一鍵摘要：點擊小夥伴，自動擷取當前頁面內容並生成摘要，串流輸出、即時顯示
• 六種語氣任選：幽默、正經、溫柔、熱血、厭世、文青，摘要用你喜歡的口吻呈現
• 四種摘要類型：重點條列、懶人包、開場白、標題，依需求切換
• 每頁自動摘要：開啟後，打開網頁小夥伴就自動先幫你讀好
• 智慧快取：同一頁面 30 分鐘內重新開啟直接顯示上次的摘要，不用重跑
• emoji 互動反應：看完摘要按個表情，小夥伴會用他的個性回你一句話

【隱私優先，全程本機運算】

摘要由 Chrome 瀏覽器內建的 on-device AI 模型（Gemini Nano）直接在你的裝置上運算完成，頁面內容與產生的摘要都不會被傳送到任何伺服器——包含我們自己的伺服器在內，因為我們根本沒有經營任何伺服器。所有設定與快取只存在你自己的瀏覽器裡。完整說明請見隱私權政策。

【使用需求】

• Chrome 138 以上版本（Summarizer API 內建於穩定版）
• 裝置需符合內建 AI 的硬體需求（約 4GB 以上顯示記憶體、22GB 以上可用儲存空間）
• 第一次使用會自動下載 AI 模型，之後即可離線使用

有任何問題或建議，歡迎到 GitHub 提出：
https://github.com/leochiu-a/summarize-ai
```

## 單一用途說明（Single purpose description）

審核表單會要求一句話說明這個 extension 只做一件事：

```text
擷取使用者目前瀏覽的頁面內容，並使用瀏覽器內建的 on-device AI 生成摘要供使用者閱讀。
```

## Permission justification（權限用途說明）

審核時會針對 `<all_urls>` host permission 要求說明用途，可直接照這段回：

```text
This extension displays an interactive avatar in the corner of every page and,
only when the user clicks it, reads the current page's visible text content to
generate a summary using Chrome's built-in on-device Summarizer API. Because
the avatar and summarization feature must work on any website the user
chooses to visit, the extension requests access to all URLs. No page content
is transmitted anywhere — summarization runs entirely on-device. The
"storage" permission is used only to save the user's local settings
(tone, summary type, auto-run toggle) and a short-lived (30-minute) local
cache of generated summaries, both via chrome.storage.local.
```

## Privacy policy URL

```text
https://leochiu-a.github.io/summarize-ai/privacy-policy.html
```

（需要先在 repo 的 Settings → Pages 開啟 GitHub Pages，Source 選 `main` 分支的 `/docs` 資料夾，
才會產生這個網址。首次啟用後通常 1–2 分鐘生效。）

## 類別建議

生產力工具（Productivity）或「工具」（Tools）皆可，視 Chrome Web Store 當時分類清單而定。
