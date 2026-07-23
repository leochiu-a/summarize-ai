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
2. **串流摘要**（[`src/Buddy.tsx`](src/Buddy.tsx)）：呼叫 `Summarizer.summarizeStreaming()`，狀態機 `idle → thinking → speaking → done`。等待第一個 chunk 時輪播碎念台詞、嘴巴同步開合；收到內容後即時以 [snarkdown](https://github.com/developit/snarkdown) 渲染 markdown。

## 開發

```bash
npm install
npm run build        # 產出 dist/
npm run dev          # watch mode
npm run typecheck    # tsc --noEmit
```

使用 [Vite Plus](https://viteplus.dev) 打包，content script（含 React runtime）輸出為單一 IIFE（`dist/content.js`）。UI 以 React 掛在 Shadow DOM 內，樣式與宿主頁面互不干擾。

## 載入 extension

1. 打開 `chrome://extensions`
2. 開啟右上角「開發人員模式」
3. 點「載入未封裝項目」，選擇本專案的 `dist/` 資料夾
4. 打開任何頁面，右下角就會出現小夥伴，點他開始摘要

## 本機預覽（免安裝 extension）

`demo/` 底下有測試頁，stub 掉 `chrome.runtime` 與 `Summarizer`，可直接開 `demo/index.html`（文章頁）或 `demo/homepage.html`（非文章頁 + 垃圾過濾）看 UI 與擷取行為。需先 `npm run build`（demo 的 `content.js` 由 `dist/` 複製而來，已列入 `.gitignore`）。

## 結構

```
public/manifest.json      # MV3 manifest（原樣複製進 dist）
public/assets/sprite.png  # 3 格 sprite sheet（閉嘴 / 半開 / 張嘴）
src/content.tsx           # 進入點：建 Shadow DOM host、掛載 React
src/Buddy.tsx             # 主元件：狀態機 + Summarizer 串流 + 講話動畫
src/lib/summarizer.ts     # 內容擷取（Readability + 過濾式全頁擷取）與工具
src/styles.ts             # Shadow DOM 樣式
vite.config.ts            # IIFE 打包設定
```
