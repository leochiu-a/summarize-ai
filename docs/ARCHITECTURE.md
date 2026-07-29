# 運作原理（Architecture）

這份文件記錄各功能的實作細節與踩過的坑。使用說明請看 [README](../README.md)。

擴充套件只在 `kkday.com`（含子網域）運作。所有推論都用 Chrome 內建 AI 在本機執行，內容不上傳。內建 AI 分兩組：

- **A 組**（共用 Gemini Nano）：Summarizer / Prompt（`LanguageModel`）/ Rewriter — 頁面摘要、商品摘要卡片、評論潤飾、值不值得分析。其中 Rewriter 尚未進穩定版，評論潤飾會退回 Prompt API（見下方〈評論潤飾〉）。
- **B 組**（獨立模型）：Translator / LanguageDetector — 翻譯所有評論。

兩組各自有自己的「可用性 / 下載」gate，見下方〈Model gate〉。

---

## 內容擷取（頁面摘要）

程式在 [`src/lib/summarizer.ts`](../src/lib/summarizer.ts)。

- **文章頁**：用 [Readability](https://github.com/mozilla/readability)（Firefox 閱讀模式核心）抽出乾淨正文。`charThreshold` 調低到 250 以相容中文短段落——中文資訊密度高、字數少，用預設 500 會被誤判成非文章。
- **非文章頁**（首頁、列表頁、應用程式）：Readability 抽不到正文時，退回擷取整頁可見文字，並移除高信心雜訊：
  - 框架 hydration 資料（`<script>`、`type="application/json"`，例如 Nuxt / Next 的 JSON blob）
  - 導覽 / 頁尾（`nav` / `header` / `footer` / `aside` 與對應 ARIA role）
  - cookie 彈窗（`role="dialog"`）
  - 隱藏元素（`aria-hidden` / `hidden` / inline `display:none`）

  只用標籤與 role 判斷，不猜 class 名稱，避免誤殺真內容。
- 內文截斷在 16000 字（Summarizer 輸入額度）。

摘要串流在 [`src/hooks/useSummarizer.ts`](../src/hooks/useSummarizer.ts)：依設定的語氣與摘要類型呼叫 `Summarizer.summarizeStreaming()`，狀態機 `idle → thinking → speaking → done`。等待第一個 chunk 時輪播碎念台詞、嘴巴同步開合；收到內容後即時以 [snarkdown](https://github.com/developit/snarkdown) 渲染 markdown。標題列的 ⚡ 可強制重新摘要（略過快取）。

**快取**（[`src/lib/summaryCache.ts`](../src/lib/summaryCache.ts)）：同一網址半小時內重開直接用快取、跳過模型（顯示「快取」標記），依語氣 + 摘要類型分開存。存在 `chrome.storage.local`（跨分頁、跨重新整理），測試 / demo 無此 API 時退回記憶體。

---

## 商品重點摘要卡片（Prompt API）

只在商品頁（URL 形如 `/product/<id>`）觸發，由 [`src/productPageSummary.ts`](../src/productPageSummary.ts) 編排、資料層在 `src/lib/product*.ts`。

1. **偵測與定位**（[`src/lib/productPage.ts`](../src/lib/productPage.ts)）：`isProductPage()` 認出商品頁；`findDescSection()` 以 `#product-info-sec` 為主、退回用「商品說明」標題文字反查外框（不綁 Vue `data-v-*` / 樣式 class，避免改版誤傷）；`extractDescText()` 抽出去掉標題與雜訊的內文（截斷 6000 字）。
2. **等待與注入**：KKday 是 Nuxt SPA，`waitForDescSection()` 用 `MutationObserver` 等區塊 render 完成，才把獨立 Shadow DOM host 插在「商品說明」標題正下方（樣式隔離、不依賴宿主 CSS）。`onRouteChange()` patch `history` API，站內導航切換商品時拆掉舊卡片重跑；另有 sentinel + observer 守住被框架 re-render 洗掉時重新注入。
3. **串流摘要**（[`src/lib/productSummary.ts`](../src/lib/productSummary.ts)）：用 `LanguageModel.create()` 建 session，`session.promptStreaming(指示 + 內文)` 串流輸出「一段話」（繁中、2～3 句、不條列、不用 Markdown、聚焦「這是什麼 + 適合哪種旅客」）。語氣沿用 popup 設定，但用商品摘要專屬的一組語氣描述（`PRODUCT_TONES`，針對「一段話」情境調整）。收到第一塊前顯示 skeleton。
4. **快取**（[`src/lib/productSummaryCache.ts`](../src/lib/productSummaryCache.ts)）：以「商品 id + 語氣」為 key 存 `chrome.storage.local`，TTL 24 小時（商品說明變動少）。

狀態機在 [`src/hooks/useProductSummary.ts`](../src/hooks/useProductSummary.ts)（`idle → checking →`（需要時）`needs-activation → generating → done / error`），UI 在 [`src/components/ProductSummaryCard.tsx`](../src/components/ProductSummaryCard.tsx)，樣式對齊原生 `.ai-summary`。

> **Prompt API 語言限制**：`expectedInputs` / `expectedOutputs` 只支援 `[de, en, es, fr, ja]`，指定 `zh-Hant` 會被拒。因此不宣告語言、改由指示要求繁中輸出（品質不保證，屬 API 未正式支援的語言）。

---

## 值不值得買分析（Prompt API）

商品頁右下角 buddy 的模式之一，程式在 [`src/hooks/useWorthIt.ts`](../src/hooks/useWorthIt.ts) 與 [`src/components/WorthBuddy.tsx`](../src/components/WorthBuddy.tsx)。

- 事實由 [`src/lib/productFacts.ts`](../src/lib/productFacts.ts) 從 JSON-LD + DOM 抽出（評分、價格、折扣券等），餵給 `LanguageModel` 串流生成「結論先行 + 短理由」的購買建議。
- 使用者點頭像才判斷（需使用者手勢）；結果快取 24h（[`src/lib/worthItCache.ts`](../src/lib/worthItCache.ts)）。

---

## 評論潤飾（Rewriter，退回 Prompt API）

只在評論撰寫頁（URL 形如 `/order/comment/<id>`）觸發，程式在 [`src/hooks/useReviewRewrite.ts`](../src/hooks/useReviewRewrite.ts) 與 [`src/components/ReviewBuddy.tsx`](../src/components/ReviewBuddy.tsx)。

- buddy 監看評論 textarea，內容寫滿 45 字才出現「幫我想想」引導提示。
- [`src/lib/reviewRewrite.ts`](../src/lib/reviewRewrite.ts) 串流潤飾使用者已寫好的內容——只順句、不杜撰。
- 潤飾結果需使用者按「套用到評論」才寫回 textarea，**不代送**。
- 以「原文 + 語氣」為快取：原文沒變又按「幫我想想」就沿用上次結果，不重跑模型。但「重新潤飾」會**略過快取**，並在 prompt / Rewriter 的 per-call `context` 追加「換不同句構與用詞」的要求——本機模型重跑常吐出幾乎一樣的句子，不加這個要求使用者會以為按鈕沒反應。

### 為什麼有 fallback

Rewriter API 語意最貼合「潤飾」，但它**沒有進 Chrome 穩定版**：origin trial 只跑到 Chrome 148 就結束，之後只剩 `chrome://flags/#rewriter-api`（Chrome 151 實測 `typeof Rewriter === 'undefined'`）。一般使用者裝了 extension 也用不到，所以 `generateRewrite()` 分兩條路：

1. **首選 Rewriter**：`typeof Rewriter !== 'undefined'` 且 `availability() !== 'unavailable'`，`create()` 也成功才走。
2. **退回 Prompt API**（`LanguageModel`，extension 從 Chrome 138 起穩定）：把同一份 `sharedContext()` 當指示送進 `promptStreaming`，另外多要求「只輸出潤飾後的本文」——Rewriter 靠 API 語意就知道輸入是待潤飾的原文，通用模型得講明白。

兩條路底層是同一顆 Gemini Nano，所以 gate 不必為 Rewriter 另開一組判斷：modelGate 放行（base model 就緒）就至少有一條路能跑。

一個刻意的取捨：**只在 availability / `create()` 階段才退回**。一旦開始串流，UI 上已經有文字，這時再換 Prompt API 重跑會讓畫面整段跳掉，所以直接讓錯誤浮到 UI。

---

## 翻譯所有評論（Translator + LanguageDetector）

只在商品頁的評論區觸發，程式在 [`src/productPageReviews.ts`](../src/productPageReviews.ts)、[`src/lib/reviewTranslate.ts`](../src/lib/reviewTranslate.ts)、[`src/hooks/useReviewTranslate.ts`](../src/hooks/useReviewTranslate.ts)。

- 在評分列下方注入「翻譯所有評論」按鈕（[`src/components/ReviewTranslateButton.tsx`](../src/components/ReviewTranslateButton.tsx)）。
- 一鍵用 LanguageDetector 偵測每則評論語言，把非頁面語系的評論用 Translator 逐則就地翻成閱讀者語言，可切換顯示原文 / 譯文。
- 用 B 組模型，有獨立的下載 gate（首次點按鈕即為下載手勢）。

---

## Model gate / consent 流程

程式在 [`src/lib/modelGate.ts`](../src/lib/modelGate.ts)、[`src/hooks/useModelGate.ts`](../src/hooks/useModelGate.ts)、[`src/components/ConsentBuddy.tsx`](../src/components/ConsentBuddy.tsx)。

- A 組功能執行前的外殼把關：以無選項的 `LanguageModel.availability()` 當 base-model probe，判斷 Gemini Nano 是否就緒。
- 未就緒時先徵求同意才下載（Chrome 要求模型下載必須在**使用者手勢**內觸發），下載時顯示進度。
- 下載完成後廣播，讓同一頁其他等待中的 UI 就地復活、不用重整。
- B 組（翻譯）有獨立 gate，首次點翻譯按鈕即為下載手勢。

---

## WebMCP tool 層（實驗性）

跟上面所有功能相反的方向：前面每一項都是「我們自己在瀏覽器裡跑一個小模型」，這一層是
**把頁面的能力開放給使用者自己帶來的 agent**（Gemini in Chrome、Claude in Chrome、
透過 `chrome-devtools-mcp` 接進來的 Claude Code…）。它繞開了內建 AI 的兩個硬限制——繁體中文
不在 Gemini Nano 支援語言內、mobile 完全不支援——因為推論不在我們這邊做，我們只負責提供
結構化事實。

程式在 [`src/webmcp.ts`](../src/webmcp.ts)（註冊層）與
[`src/lib/webmcpTools.ts`](../src/lib/webmcpTools.ts)（tool 定義）。**只有兩支，而且都是唯讀**：
`search_products`（全站）打 SRP 自己在用的搜尋 API；`check_package_availability`（商品頁）打
可訂性 API，回逐方案可訂與否 + 剩餘數量。

架構上要知道的三件事：

- **它是第二支 content script，跑在 MAIN world。** `document.modelContext` 是 page world 的
  物件，MV3 預設的 ISOLATED world 有自己一份 `document`，看不到它。代價是 MAIN world 拿不到
  `chrome.*`，所以 `src/webmcp.ts` 只能 import 不碰 chrome API 的 lib 模組（`productPage` /
  `packageAvailability` / `packageCalendar` / `productSearch`），不能用 `settings.ts` 與三個
  cache 模組。build 後 `dist/webmcp.js` 裡不應出現任何 `chrome.` 參照。
- **它是提案原型，不是上線路徑。** WebMCP 是給網站作者用的 API；這裡是用擴充套件在 kkday.com
  上「代替網站」註冊 tool，目的是在動 Nuxt 之前先驗證 tool 的粒度、schema 與輸出大小對 agent
  好不好用。正式做法是把同一組定義搬進 KKday 自己的前端。
- **曾經有 7 支，benchmark 之後砍到 2 支。** 判準是：**WebMCP 省的是「跨頁抓取與多步互動」，
  不是「包裝單頁資料」**——商品頁那 12,000 字本來就 100% SSR、一次在 DOM 裡，包成 tool 實測
  反而更貴。剩下的兩支都不在包裝 DOM。

完整的設計理由、benchmark 數據與 eval 腳本在 [`webmcp.md`](webmcp.md)；
需要 KKday 前後端配合的事整理在 [`kkday-findings.md`](kkday-findings.md)。

---

## Build

`pnpm run build` 分三階段：

1. `vp build` 打包 content script（含 React runtime，輸出單一 IIFE `dist/content.js`）
2. `vp build --config vite.popup.config.ts` 打包 popup（一般 extension 頁面，可用 ESM，輸出 `dist/popup.html` + JS/CSS）
3. `vp build --config vite.webmcp.config.ts` 打包 WebMCP 註冊層（MAIN world，IIFE `dist/webmcp.js`，無 React、無 `chrome.*`）

三個 build 都寫進同一個 `dist`，所以只有第一階段（非 watch 模式）會清空目錄，另外兩個一律
`emptyOutDir: false`——否則誰跑第二次都會刪掉別人的產物。

UI 以 React 掛在 Shadow DOM 內，樣式與宿主頁面互不干擾；popup 是獨立頁面，用一般 `<link>` / `<style>` 即可。

---

## 測試策略

Chrome extension 難測的點在於：真正的環境（真實網站 DOM + 真實內建 AI 模型）既無法進 CI，也無法在單元測試裡模擬。所以分三層，各自只負責抓自己抓得到的東西。

| 層 | 怎麼跑 | 抓得到 | 抓不到 |
| --- | --- | --- | --- |
| 單元 | `pnpm test`（vitest + jsdom，`vi.stubGlobal` stub AI API） | prompt 組裝、fallback 分支、快取、字數門檻、phase 轉換 | 真實 DOM selector、框架雙向綁定、注入位置、CSS |
| demo 頁 | `pnpm demo`（見 [README](../README.md#本機預覽免安裝-extension)） | 注入是否成功、整個互動流程、UI 實際渲染、各種 API 組合下的降級行為 | 真實網站的 DOM 結構、真實模型的輸出品質 |
| 實機 | 載入 `dist/` 到 Chrome，開真實 kkday 頁面；`/probe` 頁看環境 | selector 是否命中、Nuxt 綁定是否同步、模型輸出品質、API 可用性 | —（但不可自動化、不進 CI） |

幾個刻意的決定：

- **真實 AI API 永遠不進 CI。** 需要模型下載（22GB 空間）、硬體門檻、且輸出不決定性。demo 層的 stub 才是決定性的，適合自動化。
- **demo 頁負責「降級路徑」。** 評論頁的 `?api=` 參數可以模擬「只有 LanguageModel」（＝一般使用者的真實情況）、「Rewriter 也在」、「兩個都沒有」三種環境，不必真的去改 `chrome://flags` 或換機器。這類環境相依的 bug（例如 Rewriter 沒進穩定版）看程式碼是看不出來的。
- **框架綁定要有「會變紅」的監控。** 見 README 對評論頁那塊「框架 state」的說明。`writeReviewDraft()` 的 native setter + dispatch event 是給 Nuxt(Vue) 看的，jsdom 沒有框架，所以單元測試對它永遠是綠的。
- **selector 是最脆弱的地方。** [`getReviewTextarea()`](../src/lib/reviewPage.ts) 目前用「placeholder 關鍵字 → 退回第一個 textarea」的通用寫法。要真正防漂移，得把真實評論頁的 DOM 片段存成 fixture 讓單元測試對它跑（尚未做，需要登入的訂單頁才抓得到）。
