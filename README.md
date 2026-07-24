# Summarize AI Buddy

Chrome extension：在 [kkday.com](https://kkday.com) 網頁右下角會出現一個 pixel 小夥伴，點他就會用 Chrome 內建的 [Summarizer API](https://developer.chrome.com/docs/ai/summarizer-api) 摘要目前頁面（文章頁或首頁/列表頁都行），串流輸出時嘴巴會動、像在講話。

此外，進入 KKday **商品頁**時，會自動在「商品說明」標題下方插入一張 **AI 商品重點摘要卡片**，用一段話說明「這是什麼商品、適合哪一種旅客」，視覺對齊 KKday 原生的「AI 精選旅客評論摘要」框。這張卡片用 Chrome 內建的 [Prompt API](https://developer.chrome.com/docs/ai/prompt-api)（`LanguageModel`）串流輸出。

## 需求

- Chrome 138+（Summarizer API 內建於穩定版）
- 裝置需符合內建 AI 硬體需求（>4GB VRAM、>22GB 可用空間；第一次使用會自動下載 Gemini Nano 模型）
- 只在 `kkday.com`（含子網域）上運作，manifest 的 `content_scripts` / `web_accessible_resources` 都限定這個 host pattern

## 運作原理

點擊小夥伴後：

1. **擷取內容**（[`src/lib/summarizer.ts`](src/lib/summarizer.ts)）
   - **文章頁**：用 [Readability](https://github.com/mozilla/readability)（Firefox 閱讀模式核心）抽出乾淨正文。`charThreshold` 調低到 250 以相容中文短段落（資訊密度高、字數少，用預設 500 會被誤判成非文章）。
   - **非文章頁**（首頁、列表頁、應用程式）：Readability 抽不到正文時，退回擷取整頁可見文字，並移除高信心雜訊——框架 hydration 資料（`<script>`、`type="application/json"`，例如 Nuxt / Next 的 JSON blob）、導覽/頁尾（`nav`/`header`/`footer`/`aside` 與對應 ARIA role）、cookie 彈窗（`role="dialog"`）、隱藏元素（`aria-hidden` / `hidden` / inline `display:none`）。只用標籤與 role 判斷，不猜 class 名稱，避免誤殺真內容。
   - 內文截斷在 16000 字（Summarizer 輸入額度）。
2. **查快取**（[`src/lib/summaryCache.ts`](src/lib/summaryCache.ts)）：同一個網址半小時內重開，直接用快取、跳過模型（顯示「快取」標記）。存在 `chrome.storage.local`（跨分頁、跨重新整理），測試 / demo 無此 API 時退回記憶體。
3. **串流摘要**（[`src/hooks/useSummarizer.ts`](src/hooks/useSummarizer.ts)）：依使用者設定的語氣與摘要類型呼叫 `Summarizer.summarizeStreaming()`，狀態機 `idle → thinking → speaking → done`。等待第一個 chunk 時輪播碎念台詞、嘴巴同步開合；收到內容後即時以 [snarkdown](https://github.com/developit/snarkdown) 渲染 markdown，完成後寫入快取。標題列的 ⚡ 可強制重新摘要（略過快取）。

## 商品說明摘要卡片（Prompt API）

只在商品頁（URL 形如 `/product/<id>`）觸發，流程在 [`src/content.tsx`](src/content.tsx) 編排、資料層在 `src/lib/product*.ts`：

1. **偵測與定位**（[`src/lib/productPage.ts`](src/lib/productPage.ts)）：`isProductPage()` 認出商品頁；`findDescSection()` 以 `#product-info-sec` 為主、退回用「商品說明」標題文字反查外框（不綁 Vue `data-v-*` / 樣式 class，避免改版誤傷）；`extractDescText()` 抽出去掉標題與雜訊的內文（截斷 6000 字）。
2. **等待與注入**：KKday 是 Nuxt SPA，`waitForDescSection()` 用 `MutationObserver` 等區塊 render 完成，才把獨立 Shadow DOM host 插在「商品說明」標題正下方（樣式隔離、不依賴宿主 CSS）。`onRouteChange()` patch `history` API，站內導航切換商品時拆掉舊卡片重跑；另有 sentinel + observer 守住被框架 re-render 洗掉時重新注入。
3. **串流摘要**（[`src/lib/productSummary.ts`](src/lib/productSummary.ts)）：用 `LanguageModel.create()` 建 session，`session.promptStreaming(指示 + 內文)` 串流輸出「一段話」（指示要求：繁中、2～3 句、不條列 / 不用 Markdown、聚焦「這是什麼 + 適合哪種旅客」）；**語氣沿用 popup 的設定**（幽默 / 正經 / 溫柔…），但用商品摘要專屬的一組語氣描述（`productSummary.ts` 的 `PRODUCT_TONES`，針對「一段話」情境調整，而非 buddy 那組「整理重點」的措辭）。收到第一塊前顯示 skeleton，之後邊生成邊即時顯示。<br>注意：Prompt API 的 `expectedInputs/expectedOutputs` 只支援 `[de, en, es, fr, ja]`，指定 `zh-Hant` 會被拒，因此不宣告語言、改由指示要求繁中輸出（品質不保證，屬 API 未正式支援的語言）。
4. **可用性與手勢**：模型 `availability` 非 `available` 時不自動跑（Chrome 要求「使用者手勢」才能下載模型），改顯示按鈕讓使用者點一下觸發。
5. **快取**（[`src/lib/productSummaryCache.ts`](src/lib/productSummaryCache.ts)）：以「商品 id + 語氣」為 key 存 `chrome.storage.local`，TTL 24 小時（商品說明變動少）；命中顯示「快取」標記。

狀態機在 [`src/hooks/useProductSummary.ts`](src/hooks/useProductSummary.ts)（`idle → checking →`（需要時）`needs-activation → generating → done / error`），UI 在 [`src/components/ProductSummaryCard.tsx`](src/components/ProductSummaryCard.tsx)，樣式對齊原生 `.ai-summary`。

## 設定（popup）

點擊瀏覽器工具列的 extension 圖示開啟設定：

- **語氣**：幽默😜／正經🧐／溫柔🤗／熱血🔥／厭世🥱／文青🌸，預設幽默。透過 `sharedContext` 影響模型的 summarize 口吻。
- **摘要類型**：對應 Summarizer API 的 `type`——重點 / 懶人包 / 開場白 / 標題。
- **每頁自動摘要**：開啟後每個頁面載入就自動觸發一次摘要，不用手動點小夥伴。

設定存在 `chrome.storage.local`，跨分頁即時同步（popup 存檔後，已開啟的分頁馬上套用）；語氣與摘要類型不同會各自快取（見上方快取機制）。原始碼在 [`src/popup/`](src/popup)，資料層在 [`src/lib/settings.ts`](src/lib/settings.ts)。

## 開發

本專案用 [pnpm](https://pnpm.io/)（`packageManager` 已鎖版本；`.npmrc` 設 `node-linker=hoisted`，讓 tsc 找得到型別）。

```bash
pnpm install
pnpm run build        # 產出 dist/
pnpm run dev          # watch mode
pnpm run typecheck    # tsc --noEmit
pnpm test             # vitest（jsdom 環境）
pnpm run test:watch   # vitest watch
```

測試分幾層：
- `src/lib/summarizer.test.ts` — 內容擷取邏輯：Readability 抽正文、非文章頁的垃圾過濾、輸入截斷與工具函式。
- `src/lib/summaryCache.test.ts` — 快取讀寫與 TTL 判斷。
- `src/lib/settings.test.ts` — 設定的預設值、merge、資料表完整性，以及**連續快速寫入不互相覆蓋**（同步 merge 在記憶體真相來源上，避免 popup 快速切換設定時只剩最後一次生效）。
- `src/Buddy.test.tsx` — 元件狀態機（React Testing Library）：thinking→speaking→done 轉換、思考時被催的不耐煩回應與輪播、emoji 反應回嘴、快取命中 / 強制重跑、自動摘要設定生效與否。
- `src/lib/productPage.test.ts` — 商品頁偵測、`#product-info-sec` / 標題反查定位、內文擷取濾雜訊、`onRouteChange` 只在 pathname 變動時觸發。
- `src/lib/productSummary.test.ts` — stub `LanguageModel`：驗證語氣注入指示、串流 chunks 累加、`create` 不帶選項、API 不支援時的錯誤。
- `src/lib/productSummaryCache.test.ts` — 商品摘要快取讀寫、語氣分開存、TTL。
- `src/components/ProductSummaryCard.test.tsx` — 掛載自動產生並顯示摘要文字、模型不可用顯示錯誤、未下載時顯示按鈕點擊後才呼叫模型。

`pnpm run build` 分兩階段：`vp build` 打包 content script（含 React runtime，輸出單一 IIFE `dist/content.js`），接著 `vp build --config vite.popup.config.ts` 打包 popup（一般 extension 頁面，可用 ESM，輸出 `dist/popup.html` + JS/CSS）。UI 以 React 掛在 Shadow DOM 內，樣式與宿主頁面互不干擾；popup 是獨立頁面，用一般 `<link>`/`<style>` 即可。

## 載入 extension

1. 打開 `chrome://extensions`
2. 開啟右上角「開發人員模式」
3. 點「載入未封裝項目」，選擇本專案的 `dist/` 資料夾
4. 打開 kkday.com 上的任何頁面，右下角就會出現小夥伴，點他開始摘要

## 打包成 zip（上架 / 分發）

```bash
pnpm run package
```

依序跑 typecheck → 測試 → build，最後用 [web-ext](https://github.com/mozilla/web-ext) 把 `dist/` 打包成 `release/summarize_ai_buddy-<version>.zip`（版本號讀自 `manifest.json`）。這個 zip 可以直接上傳到 [Chrome Web Store 開發者後台](https://chrome.google.com/webstore/devconsole)，或分享給別人手動安裝。`release/` 已列入 `.gitignore`，每次執行都會用 `--overwrite-dest` 覆蓋舊檔。

要發新版本前，記得先更新 `public/manifest.json` 的 `version` 欄位。

## 本機預覽（免安裝 extension）

`demo/` 底下有測試頁，stub 掉 `chrome.runtime` 與 `Summarizer`，可直接開 `demo/index.html`（文章頁）或 `demo/homepage.html`（非文章頁 + 垃圾過濾）看 UI 與擷取行為。需先 `pnpm run build`（demo 的 `content.js` 由 `dist/` 複製而來，已列入 `.gitignore`）。

## 結構

```
public/manifest.json          # MV3 manifest（原樣複製進 dist）
public/assets/sprite.png      # 3 格 sprite sheet（閉嘴 / 半開 / 張嘴）
public/assets/emoji/          # emoji 資產：靜態 .svg + 動畫 .webp（Google Noto）
popup.html                    # popup 進入頁
vite.popup.config.ts          # popup 的獨立 build 設定（ESM，不 emptyOutDir）
src/content.tsx               # content script 進入點：掛載小夥伴 + 商品說明摘要卡片注入編排
src/Buddy.tsx                 # 編排層：組合 hooks 與子元件、bubble 版面
src/components/Avatar.tsx     # 小夥伴頭像（sprite 嘴型）
src/components/ReactionBar.tsx# 反應 emoji 列
src/components/EmojiIcon.tsx  # 共用 emoji 圖示：靜態 SVG + hover 動畫 webp
src/components/ProductSummaryCard.tsx # 商品說明摘要卡片（一段話 + skeleton / error 態）
src/hooks/useSummarizer.ts    # 摘要流程 + 狀態機 + 快取 + 設定
src/hooks/useProductSummary.ts# 商品摘要流程 + 狀態機（Prompt API，串流一段話）
src/hooks/useThinkingChatter.ts # 思考碎念輪播 + 不耐煩回應
src/hooks/useTalkingMouth.ts  # 講話嘴型動畫
src/hooks/useReactions.ts     # emoji 反應狀態
src/hooks/useSettings.ts      # 讀取 / 更新設定，訂閱跨分頁變更
src/lib/summarizer.ts         # 內容擷取（Readability + 過濾式全頁擷取）
src/lib/summaryCache.ts       # 半小時頁面摘要快取（依語氣 + 摘要類型分開存）
src/lib/productPage.ts        # 商品頁偵測 / 定位商品說明 / 擷取內文 / SPA 路由事件
src/lib/productSummary.ts     # Prompt API 包裝：串流輸出一段話（依語氣調整口吻）
src/lib/productSummaryCache.ts# 商品摘要快取（依商品 id + 語氣分開存，24h TTL）
src/lib/settings.ts           # 使用者設定：語氣 / 摘要類型 / 自動摘要
src/lib/reactions.ts          # 反應 emoji 資料
src/styles.ts                 # content script 的 Shadow DOM 樣式
src/productSummaryStyles.ts   # 商品摘要卡片的 Shadow DOM 樣式
src/popup/PopupApp.tsx        # 設定頁面元件
src/popup/popup.css           # 設定頁面樣式（獨立頁面，非 Shadow DOM）
src/popup/main.tsx            # popup 進入點
vite.config.ts                # content script IIFE 打包設定
```
