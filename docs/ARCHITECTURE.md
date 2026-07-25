# 運作原理（Architecture）

這份文件記錄各功能的實作細節與踩過的坑。使用說明請看 [README](../README.md)。

擴充套件只在 `kkday.com`（含子網域）運作。所有推論都用 Chrome 內建 AI 在本機執行，內容不上傳。內建 AI 分兩組：

- **A 組**（共用 Gemini Nano）：Summarizer / Prompt（`LanguageModel`）/ Rewriter — 頁面摘要、商品摘要卡片、評論潤飾、值不值得分析。
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

## 評論潤飾（Rewriter API）

只在評論撰寫頁（URL 形如 `/order/comment/<id>`）觸發，程式在 [`src/hooks/useReviewRewrite.ts`](../src/hooks/useReviewRewrite.ts) 與 [`src/components/ReviewBuddy.tsx`](../src/components/ReviewBuddy.tsx)。

- buddy 監看評論 textarea，內容寫滿 45 字才出現「幫我想想」引導提示。
- 用 Rewriter API（[`src/lib/reviewRewrite.ts`](../src/lib/reviewRewrite.ts)）串流潤飾使用者已寫好的內容——只順句、不杜撰。
- 潤飾結果需使用者按「套用到評論」才寫回 textarea，**不代送**。

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

## Build

`pnpm run build` 分兩階段：

1. `vp build` 打包 content script（含 React runtime，輸出單一 IIFE `dist/content.js`）
2. `vp build --config vite.popup.config.ts` 打包 popup（一般 extension 頁面，可用 ESM，輸出 `dist/popup.html` + JS/CSS）

UI 以 React 掛在 Shadow DOM 內，樣式與宿主頁面互不干擾；popup 是獨立頁面，用一般 `<link>` / `<style>` 即可。
