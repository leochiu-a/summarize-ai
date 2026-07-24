# Chrome Web Store 上架文案

複製到開發者後台（[Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)）
對應欄位時，請貼「純文字」版本（下方 code block 內），不要連 Markdown 語法一起貼上去
——商店欄位不會渲染 `**`/`*`，會直接顯示星號。

---

## 簡短描述（Short description，上限 132 字元）

**這一段就是後台「Summary from package」自動帶出來的文字**——它直接讀取 `public/manifest.json`
的 `"description"` 欄位，不是表單裡另外填的獨立欄位，也沒辦法在後台直接編輯，要改字就是改
manifest 再重新上傳套件。目前 68 字元，在上限內：

```text
在 kkday.com 網頁右下角召喚 pixel 小夥伴，用 Chrome 內建 AI 幫你摘要頁面內容，語氣任選、全程本機運算不上傳
```

## 詳細描述（Detailed description）

⚠️ 這段開頭刻意**不要**跟上面的 Summary 重複（後台會把兩段疊在一起顯示，逐字重複讀起來會很怪），
直接從小夥伴的個性與功能清單切入：

```text
會碎念、會動嘴講話，看完摘要還會用表情回你一句話——這不是普通的摘要工具，是一個有個性的 pixel 小夥伴。不管是落落長的文章，還是資訊爆炸的列表頁，點一下都能快速幫你抓到重點。

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

• 僅在 kkday.com（含子網域）上運作，其他網站不會出現小夥伴
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

開發者後台會**針對每個宣告的權限各自要求一段說明**（各自獨立的文字框，上限 1000 字元），
不是合併成一段。

### Host permission justification（對應 `*://kkday.com/*`、`*://*.kkday.com/*`）

已經改用限定網域的 host pattern，**不再是 `<all_urls>`**，所以後台「Broad Host Permissions」
那則深度審查警告不會再出現。

```text
This extension displays an interactive avatar in the corner of pages on
kkday.com (including its subdomains) and, only when the user clicks it,
reads the current page's visible text content to generate a summary using
Chrome's built-in on-device Summarizer API. Host permission is limited to
kkday.com and its subdomains only — the extension does not run on, and has
no access to, any other website. No page content is transmitted anywhere —
summarization runs entirely on-device.
```

### storage justification（對應 `"permissions": ["storage"]`）

```text
The storage permission is used to save the user's own preferences locally
via chrome.storage.local: their chosen tone (humorous, serious, gentle,
passionate, cynical, literary), summary type (key points, TL;DR, teaser,
headline), and whether to auto-summarize every page. It also stores a
short-lived (30-minute) local cache of previously generated summaries,
keyed by page URL, so revisiting the same page doesn't unnecessarily
re-run the on-device AI model. All of this data stays on the user's
device via chrome.storage.local — nothing is transmitted to any server,
and it is cleared automatically when the extension is removed.
```

## Privacy policy URL

```text
https://leochiu-a.github.io/summarize-ai/privacy-policy.html
```

## Data usage 揭露表單（Data usage disclosure）

開發者後台會要求勾選「打算蒐集哪些使用者資料」。重點：**Google 的政策明訂，資料就算只在
本機處理、從未傳到任何伺服器，一樣算「handle」使用者資料，必須揭露**——不是「有沒有上傳」
才算數（來源：[disclosure-requirements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements)、
[user-data-faq](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)）。

依這個原則對照本專案實際行為：

| 項目 | 勾選 | 理由 |
|---|---|---|
| Personally identifiable information | 否 | 未處理姓名／信箱／生日等資料 |
| Health information | 否 | 不適用 |
| Financial and payment information | 否 | 不適用 |
| Authentication information | 否 | 不適用 |
| Personal communications | 否 | 不適用 |
| Location | 否 | 不適用 |
| **Web history** | **是** | `summaryCache.ts` 把「網址＋頁面標題＋時間戳記」存在本機 30 分鐘，對應範例「頁面清單、標題、造訪時間」 |
| User activity | 否 | 只監聽自己 UI 元件（頭像／emoji 按鈕）的點擊，不追蹤頁面上的滑鼠／捲動／按鍵 |
| **Website content** | **是** | 核心功能：讀取當前頁面文字內容以產生摘要 |

三個「I certify」勾選框都勾選——資料不賣給第三方、用途不超出摘要這個單一用途、
不涉及信用評分或放貸，這三項對本專案都成立。

勾選 Web history + Website content 後，記得跟 [privacy-policy.html](privacy-policy.html) 的內容
保持一致（審核時會交叉比對）：目前隱私權政策已經提到「快取內容包含頁面網址與產生的摘要文字」，
已經對得起來，之後改動快取或擷取邏輯時兩邊要一起更新。

（需要先在 repo 的 Settings → Pages 開啟 GitHub Pages，Source 選 `main` 分支的 `/docs` 資料夾，
才會產生這個網址。首次啟用後通常 1–2 分鐘生效。）

## 類別建議

生產力工具（Productivity）或「工具」（Tools）皆可，視 Chrome Web Store 當時分類清單而定。

## 上架方式建議

這個擴充功能現在限定只在 kkday.com 上運作，比較像是公司內部工具，不見得需要走「公開上架、
讓任何人都能搜尋安裝」這條路（反正非 kkday 使用者裝了也用不了）。可以考慮：

- **Unlisted（不公開列出）**：在開發者後台把可見度設為 Unlisted，只有拿到直接連結的人能安裝，
  不會出現在 Chrome Web Store 搜尋結果裡，但審核流程跟公開上架一樣。
- **企業強制安裝**：如果公司有用 Google Workspace 管理 Chrome，可透過 Google Admin 主控台
  把擴充功能推送給指定帳號，完全不用經過 Chrome Web Store 審核。
- **直接分享 zip**：同事各自 `chrome://extensions` → 開發人員模式 → 載入未封裝項目
  （或載入 `npm run package` 產出的 zip 解壓後的資料夾），適合人數少、更新頻繁的階段。

如果之後還是想公開上架（例如未來要開放給更多 kkday 網域外的使用者），上面幾段文案都還適用。
