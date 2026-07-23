# Summarize AI Buddy

Chrome extension：網頁右下角會出現一個 pixel 小夥伴，點他就會用 Chrome 內建的 [Summarizer API](https://developer.chrome.com/docs/ai/summarizer-api) 摘要目前頁面（文章頁或首頁/列表頁都行），串流輸出時嘴巴會動、像在講話。

## 需求

- Chrome 138+（Summarizer API 內建於穩定版）
- 裝置需符合內建 AI 硬體需求（>4GB VRAM、>22GB 可用空間；第一次使用會自動下載 Gemini Nano 模型）

## 運作原理

點擊小夥伴後：

1. **擷取內容**（[`src/lib/summarizer.ts`](src/lib/summarizer.ts)）
   - **文章頁**：用 [Readability](https://github.com/mozilla/readability)（Firefox 閱讀模式核心）抽出乾淨正文。`charThreshold` 調低到 250 以相容中文短段落（資訊密度高、字數少，用預設 500 會被誤判成非文章）。
   - **非文章頁**（首頁、列表頁、應用程式）：Readability 抽不到正文時，退回擷取整頁可見文字，並移除高信心雜訊——框架 hydration 資料（`<script>`、`type="application/json"`，例如 Nuxt / Next 的 JSON blob）、導覽/頁尾（`nav`/`header`/`footer`/`aside` 與對應 ARIA role）、cookie 彈窗（`role="dialog"`）、隱藏元素（`aria-hidden` / `hidden` / inline `display:none`）。只用標籤與 role 判斷，不猜 class 名稱，避免誤殺真內容。
   - 內文截斷在 16000 字（Summarizer 輸入額度）。
2. **查快取**（[`src/lib/summaryCache.ts`](src/lib/summaryCache.ts)）：同一個網址半小時內重開，直接用快取、跳過模型（顯示「快取」標記）。存在 `chrome.storage.local`（跨分頁、跨重新整理），測試 / demo 無此 API 時退回記憶體。
3. **串流摘要**（[`src/hooks/useSummarizer.ts`](src/hooks/useSummarizer.ts)）：依使用者設定的語氣與摘要類型呼叫 `Summarizer.summarizeStreaming()`，狀態機 `idle → thinking → speaking → done`。等待第一個 chunk 時輪播碎念台詞、嘴巴同步開合；收到內容後即時以 [snarkdown](https://github.com/developit/snarkdown) 渲染 markdown，完成後寫入快取。標題列的 ⚡ 可強制重新摘要（略過快取）。

## 設定（popup）

點擊瀏覽器工具列的 extension 圖示開啟設定：

- **語氣**：幽默😜／正經🧐／溫柔🤗／熱血🔥／厭世🥱／文青🌸，預設幽默。透過 `sharedContext` 影響模型的 summarize 口吻。
- **摘要類型**：對應 Summarizer API 的 `type`——重點 / 懶人包 / 開場白 / 標題。
- **每頁自動摘要**：開啟後每個頁面載入就自動觸發一次摘要，不用手動點小夥伴。

設定存在 `chrome.storage.local`，跨分頁即時同步（popup 存檔後，已開啟的分頁馬上套用）；語氣與摘要類型不同會各自快取（見上方快取機制）。原始碼在 [`src/popup/`](src/popup)，資料層在 [`src/lib/settings.ts`](src/lib/settings.ts)。

## 開發

```bash
npm install
npm run build        # 產出 dist/
npm run dev          # watch mode
npm run typecheck    # tsc --noEmit
npm test             # vitest（jsdom 環境）
npm run test:watch   # vitest watch
```

測試分幾層：
- `src/lib/summarizer.test.ts` — 內容擷取邏輯：Readability 抽正文、非文章頁的垃圾過濾、輸入截斷與工具函式。
- `src/lib/summaryCache.test.ts` — 快取讀寫與 TTL 判斷。
- `src/lib/settings.test.ts` — 設定的預設值、merge、資料表完整性，以及**連續快速寫入不互相覆蓋**（同步 merge 在記憶體真相來源上，避免 popup 快速切換設定時只剩最後一次生效）。
- `src/Buddy.test.tsx` — 元件狀態機（React Testing Library）：thinking→speaking→done 轉換、思考時被催的不耐煩回應與輪播、emoji 反應回嘴、快取命中 / 強制重跑、自動摘要設定生效與否。

`npm run build` 分兩階段：`vp build` 打包 content script（含 React runtime，輸出單一 IIFE `dist/content.js`），接著 `vp build --config vite.popup.config.ts` 打包 popup（一般 extension 頁面，可用 ESM，輸出 `dist/popup.html` + JS/CSS）。UI 以 React 掛在 Shadow DOM 內，樣式與宿主頁面互不干擾；popup 是獨立頁面，用一般 `<link>`/`<style>` 即可。

## 載入 extension

1. 打開 `chrome://extensions`
2. 開啟右上角「開發人員模式」
3. 點「載入未封裝項目」，選擇本專案的 `dist/` 資料夾
4. 打開任何頁面，右下角就會出現小夥伴，點他開始摘要

## 本機預覽（免安裝 extension）

`demo/` 底下有測試頁，stub 掉 `chrome.runtime` 與 `Summarizer`，可直接開 `demo/index.html`（文章頁）或 `demo/homepage.html`（非文章頁 + 垃圾過濾）看 UI 與擷取行為。需先 `npm run build`（demo 的 `content.js` 由 `dist/` 複製而來，已列入 `.gitignore`）。

## 結構

```
public/manifest.json          # MV3 manifest（原樣複製進 dist）
public/assets/sprite.png      # 3 格 sprite sheet（閉嘴 / 半開 / 張嘴）
public/assets/emoji/          # emoji 資產：靜態 .svg + 動畫 .webp（Google Noto）
popup.html                    # popup 進入頁
vite.popup.config.ts          # popup 的獨立 build 設定（ESM，不 emptyOutDir）
src/content.tsx               # content script 進入點：建 Shadow DOM host、掛載 React
src/Buddy.tsx                 # 編排層：組合 hooks 與子元件、bubble 版面
src/components/Avatar.tsx     # 小夥伴頭像（sprite 嘴型）
src/components/ReactionBar.tsx# 反應 emoji 列
src/components/EmojiIcon.tsx  # 共用 emoji 圖示：靜態 SVG + hover 動畫 webp
src/hooks/useSummarizer.ts    # 摘要流程 + 狀態機 + 快取 + 設定
src/hooks/useThinkingChatter.ts # 思考碎念輪播 + 不耐煩回應
src/hooks/useTalkingMouth.ts  # 講話嘴型動畫
src/hooks/useReactions.ts     # emoji 反應狀態
src/hooks/useSettings.ts      # 讀取 / 更新設定，訂閱跨分頁變更
src/lib/summarizer.ts         # 內容擷取（Readability + 過濾式全頁擷取）
src/lib/summaryCache.ts       # 半小時頁面摘要快取（依語氣 + 摘要類型分開存）
src/lib/settings.ts           # 使用者設定：語氣 / 摘要類型 / 自動摘要
src/lib/reactions.ts          # 反應 emoji 資料
src/styles.ts                 # content script 的 Shadow DOM 樣式
src/popup/PopupApp.tsx        # 設定頁面元件
src/popup/popup.css           # 設定頁面樣式（獨立頁面，非 Shadow DOM）
src/popup/main.tsx            # popup 進入點
vite.config.ts                # content script IIFE 打包設定
```
