# Chrome Web Store 上架文案

複製到開發者後台（[Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)）
對應欄位時，請貼「純文字」版本（下方 code block 內），不要連 Markdown 語法一起貼上去
——商店欄位不會渲染 `**`/`*`，會直接顯示星號。

---

## 簡短描述（Short description，上限 132 字元）

**這一段就是後台「Summary from package」自動帶出來的文字**——它直接讀取 `public/manifest.json`
的 `"description"` 欄位，不是表單裡另外填的獨立欄位，也沒辦法在後台直接編輯，要改字就是改
manifest 再重新上傳套件。目前 106 字元，在上限內：

```text
kkday.com 專屬 pixel 小夥伴：用 Chrome 內建 AI 摘要頁面、生成商品重點、潤飾與翻譯評論、分析值不值得買（裝置端運算），並提供唯讀 WebMCP tool 供你的 AI agent 查詢
```

⚠️ 這裡**刻意不再寫「全程裝置端運算不上傳」**。WebMCP 那一層沒有用到任何內建 AI，推論發生在
使用者自己帶來的 agent（可能是雲端服務），而且它會呼叫站方 API。原本那句話涵蓋不了這條路徑，
留著會變成不實陳述。

## 詳細描述（Detailed description）

⚠️ 這段開頭刻意**不要**跟上面的 Summary 重複（後台會把兩段疊在一起顯示，逐字重複讀起來會很怪），
直接從小夥伴的個性與功能清單切入：

```text
會碎念、會動嘴講話，看完還會用表情回你一句話——這不是普通的工具，是一個住在 kkday.com 右下角、有個性的 pixel 小夥伴。從讀文章、看商品、寫評論到決定要不要買，它都用 Chrome 內建的 on-device AI 在旁邊幫你一把。

【功能特色】

• 一鍵頁面摘要：點擊小夥伴，自動擷取當前頁面內容並生成摘要，串流輸出、即時顯示；不管是落落長的文章還是資訊爆炸的列表頁，點一下就抓到重點
• 商品重點摘要：進到商品頁時，自動在「商品說明」下方生成一段話，告訴你這是什麼商品、適合哪種旅客
• 值不值得買：在商品頁請小夥伴綜合評分、價格、折扣等資訊，給你「結論先行＋簡短理由」的購買建議
• 評論潤飾：在評論撰寫頁，幫你把已經寫好的評論順稿、潤飾（只順句、不杜撰）；要不要採用由你決定，絕不代你送出
• 一鍵翻譯評論：把其他國家旅客留下的外語評論，就地翻成你正在閱讀的語言，可隨時切換原文／譯文
• 六種語氣任選：幽默、正經、溫柔、熱血、厭世、文青，摘要用你喜歡的口吻呈現
• 四種摘要類型：重點條列、懶人包、開場白、標題，依需求切換
• 智慧快取：同一頁面短時間內重新開啟直接顯示上次的結果，不用重跑
• emoji 互動反應：看完摘要按個表情，小夥伴會用他的個性回你一句話

【給 AI agent 用的唯讀查詢工具（實驗性）】

除了上面那些「小夥伴自己幫你讀」的功能，本擴充功能還透過 WebMCP 標準，在 kkday.com 頁面上註冊兩支唯讀查詢工具，讓你自己選用的 AI agent（例如 Chrome 內建的 Gemini、或你接上的其他 MCP client）可以直接呼叫：

• 商品搜尋：依關鍵字、評分與評論數門檻回傳候選商品，附評分、價格區間與最早可出發日
• 方案可訂性查詢：查某個日期各方案訂不訂得到，以及剩餘數量

這兩支工具都是唯讀的：它們只查詢與回報資訊，不會修改頁面、不會變更你的帳號狀態，也沒有任何下單或付款的功能。這一層是實驗性功能，需要 Chrome 開啟 WebMCP 相關旗標才會生效。

【隱私說明】

摘要、商品分析、評論潤飾與翻譯這幾項，都由 Chrome 瀏覽器內建的 on-device AI 模型（Gemini Nano 等）直接在你的裝置上運算完成，頁面內容與產生的結果不會被傳送到任何伺服器——我們沒有經營任何伺服器，也不會蒐集你的資料。所有設定與快取只存在你自己的瀏覽器裡。

上面的 WebMCP 查詢工具是不一樣的路徑，要分開理解：當你的 AI agent 呼叫這些工具時，工具回傳的內容會交給那個 agent 處理。如果你使用的是雲端 AI 服務，那些內容就會依該服務自己的隱私權政策被傳送與處理——我們無法控制、也不會經手。工具本身只會向 kkday.com 自己的 API 查詢資料，不會傳送到任何其他地方。完整說明請見隱私權政策。

【使用需求】

• 僅在 kkday.com（含子網域）上運作，其他網站不會出現小夥伴
• Chrome 138 以上版本（內建 AI API 已進穩定版）
• 裝置需符合內建 AI 的硬體需求（約 4GB 以上顯示記憶體、22GB 以上可用儲存空間）
• 第一次使用某項功能時，會徵求你同意後才下載對應的 AI 模型，下載完成後即可離線使用

有任何問題或建議，歡迎到 GitHub 提出：
https://github.com/leochiu-a/summarize-ai
```

## 單一用途說明（Single purpose description）

⚠️ **這是整份文案裡審查風險最高的一欄。** 加入 WebMCP 之後，這個 extension 有兩條技術上很不一樣
的路徑（我們自己跑內建 AI／把資料交給使用者的 agent），審查員有理由問「這是不是兩個用途」。

收斂的方式是把用途定義在**使用者得到什麼**，而不是**哪個模型在算**：兩條路徑都只做一件事——
把 kkday 頁面上的資訊變得更好理解。摘要、商品分析、評論潤飾翻譯、以及提供給 agent 的唯讀查詢
工具，全部都是這件事的不同手段，沒有任何一項脫離「輔助理解 kkday 內容」。

```text
在 kkday.com 上協助使用者理解頁面內容。功能分兩種手段但只服務這一個用途：（1）用 Chrome 內建的 on-device AI 摘要頁面與商品資訊、生成購買建議、潤飾與翻譯評論；（2）透過 WebMCP 標準提供兩支唯讀查詢工具（商品搜尋、方案可訂性），讓使用者自己選用的 AI agent 能直接取得結構化的商品事實，不必自行解析頁面。兩者都只讀取與呈現 kkday 頁面上的資訊，不會修改頁面或帳號狀態，也不具備任何下單或付款功能。
```

英文版（審查員多半讀英文，這一欄建議一併提供）：

```text
This extension helps users understand content on kkday.com. It uses two mechanisms in service of that single purpose: (1) Chrome's built-in on-device AI to summarize pages and product information, generate a "worth it?" suggestion, and polish and translate reviews; (2) two read-only tools exposed via the WebMCP standard (product search and package availability) so that an AI agent chosen by the user can obtain structured product facts directly instead of parsing the page. Both mechanisms only read and present information already on kkday.com. Neither modifies page or account state, and there is no ordering, checkout, or payment capability of any kind.
```

## Permission justification（權限用途說明）

開發者後台會**針對每個宣告的權限各自要求一段說明**（各自獨立的文字框，上限 1000 字元），
不是合併成一段。

### Host permission justification（對應 `*://kkday.com/*`、`*://*.kkday.com/*`）

已經改用限定網域的 host pattern，**不再是 `<all_urls>`**，所以後台「Broad Host Permissions」
那則深度審查警告不會再出現。

```text
This extension displays an interactive avatar in the corner of pages on
kkday.com (including its subdomains). It reads the current page's visible
text content to power on-device AI features: summarizing the page (on
click), summarizing a product's description and giving a "worth it?"
buying suggestion on product pages, polishing the user's own draft review
on review-writing pages, and translating other travelers' reviews into the
user's language on product pages. All of this uses Chrome's built-in
on-device AI (Summarizer, Prompt/LanguageModel, Rewriter, Translator and
LanguageDetector) and runs entirely on the user's device.

The same host permission also covers a second, read-only content script
that runs in the main world on kkday.com pages. It registers two read-only
tools via the WebMCP standard (document.modelContext) so that an AI agent
chosen by the user can query structured product facts: product search and
package availability. To answer those queries it reads the page's own
Nuxt state (window.__NUXT__) for product and package identifiers, and
makes same-origin GET requests to kkday.com's own public endpoints
(ajax_get_product_list and fetch-items-data). These requests go only to
kkday.com, never to us or any third party — we operate no servers. Both
tools are read-only: they cannot modify page or account state, and there
is no ordering, checkout, or payment capability. When the user's agent
invokes a tool, the returned information is handled by that agent under
its own privacy policy; the extension itself transmits nothing.

The same kkday.com host pattern is also declared under host_permissions so
that the extension's own settings popup can read the URL of the currently
active tab. This is needed for the "disable on this page" control, which
lets the user turn the avatar off for one specific page. Only the URL is
read, only for kkday.com tabs, only while the popup is open, and it is
compared locally against the user's own list of disabled pages. We do not
request the broader "tabs" permission, so URLs of non-kkday tabs are never
visible to the extension.

Host permission is limited to kkday.com and its subdomains only — the
extension does not run on, and has no access to, any other website.
```

### storage justification（對應 `"permissions": ["storage"]`）

```text
The storage permission is used to save the user's own preferences locally
via chrome.storage.local: whether the avatar is enabled at all, a list of
individual pages the user has chosen to disable it on, their chosen tone
(humorous, serious, gentle, passionate, cynical, literary) and summary type
(key points, TL;DR, teaser, headline). It also stores a short-lived local cache of previously generated
results — page summaries (30 minutes, keyed by page URL) and product
summaries (24 hours, keyed by product ID) — so revisiting the same page
doesn't unnecessarily re-run the on-device AI model. All of this data stays
on the user's device via chrome.storage.local — nothing is transmitted to
any server, and it is cleared automatically when the extension is removed.
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
| **Web history** | **是** | 快取把「網址／商品 id＋頁面標題＋時間戳記」存在本機（頁面摘要 30 分鐘、商品摘要 24 小時），對應範例「頁面清單、標題、造訪時間」 |
| User activity | 否 | 只監聽自己 UI 元件（頭像／emoji／翻譯按鈕）的點擊，不追蹤頁面上的滑鼠／捲動／按鍵 |
| **Website content** | **是** | 核心功能：讀取當前頁面文字內容（頁面正文、商品說明、他人評論）以產生摘要、購買建議與翻譯；使用者自己撰寫中的評論文字也會讀取以進行潤飾。另外 WebMCP 層會讀取頁面的 Nuxt 狀態（`window.__NUXT__`）取得商品與方案 id |

三個「I certify」勾選框都勾選——資料不賣給第三方、用途不超出上述單一用途、
不涉及信用評分或放貸，這三項對本專案都成立。

### ⚠️ WebMCP 讓「僅在本機處理」不再是全部的事實

原本這張表底下可以直接寫「全部僅在本機處理」。加入 WebMCP 之後有**兩條新的資料流出路徑**，
必須在表單的說明欄位裡主動講清楚，否則審核交叉比對時會被認定揭露不實：

1. **對 kkday.com 的同源 API 請求。** `search_products` 會打 `ajax_get_product_list`（帶使用者
   的搜尋關鍵字）、`check_package_availability` 會打 `fetch-items-data`。這是本擴充功能**第一次
   發出網路請求**——目的地只有 kkday.com 自己，但「完全不連網」這個說法已經不成立。
2. **交給使用者自己的 AI agent。** tool 回傳的內容會進入那個 agent。如果它是雲端服務
   （Chrome 內建的 Gemini、其他 MCP client），資料就會離開裝置，依該服務自己的隱私權政策處理。
   **我們不是傳送方，但我們是刻意建立這條管道的人**，所以要揭露。

建議在 Website content 的說明欄位補一句：

```text
Product and package information returned by the extension's two read-only
WebMCP tools is passed to an AI agent that the user has chosen and
connected. If that agent is a cloud service, the returned information
leaves the device and is handled under that service's own privacy policy.
The extension itself operates no servers and transmits nothing to us or
any third party; its only outbound requests are same-origin GETs to
kkday.com's own endpoints.
```

跟 [privacy-policy.html](privacy-policy.html) 的內容要保持一致（審核時會交叉比對）——隱私權政策
已同步補上「WebMCP 查詢工具」與「網路請求」兩節。之後改動快取、擷取邏輯或 tool 行為時，
**三個地方（manifest description、這份文案、隱私權政策）要一起更新**。

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
  （或載入 `pnpm run package` 產出的 zip 解壓後的資料夾），適合人數少、更新頻繁的階段。

如果之後還是想公開上架（例如未來要開放給更多 kkday 網域外的使用者），上面幾段文案都還適用。
