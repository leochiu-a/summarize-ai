# Summarize AI Buddy

> 在 [kkday.com](https://kkday.com) 右下角召喚一個 pixel 小夥伴，用 **Chrome 內建 AI** 幫你摘要頁面、看懂商品、潤飾評論、翻譯評論、判斷值不值得買。全程本機運算，內容不上傳。

一個 Chrome MV3 擴充套件，只在 `kkday.com`（含子網域）上運作，把 Chrome 內建的 Gemini Nano（Summarizer / Prompt / Rewriter / Translator API）包成幾個貼著 KKday 使用情境的小功能。

## 功能

| 功能 | 觸發頁面 | 說明 | Chrome AI API |
| --- | --- | --- | --- |
| **頁面摘要** | 全站每頁 | 點右下角小夥伴，把整頁內容摘要成一段泡泡；串流輸出時嘴巴會動。語氣、摘要類型可在 popup 調。 | Summarizer |
| **商品重點摘要卡片** | 商品頁 `/product/<id>` | 在「商品說明」標題下方自動插入一張卡片，一段話說明「這是什麼商品、適合哪種旅客」，視覺對齊 KKday 原生 AI 評論摘要框。 | Prompt（`LanguageModel`）|
| **值不值得買** | 商品頁 | 小夥伴綜合評分、價格、折扣券等給「結論先行 + 短理由」的購買建議。 | Prompt（`LanguageModel`）|
| **評論潤飾** | 評論撰寫頁 `/order/comment/<id>` | 你寫好評論後，小夥伴幫你順句、潤飾（只順句、不杜撰）；要按「套用」才寫回，不代送。 | Rewriter，不可用時退回 Prompt |
| **翻譯所有評論** | 商品頁評論區 | 一鍵把非你語系的評論就地翻成你的語言，可切換原文 / 譯文。 | Translator + LanguageDetector |

第一次用到某個模型時，小夥伴會先徵求同意再下載 Gemini Nano，並顯示下載進度（Chrome 要求模型下載必須由使用者手勢觸發）。

## 需求

- **Chrome 138+**（內建 AI API 已進穩定版）
- 裝置符合內建 AI 硬體需求：> 4GB VRAM、> 22GB 可用空間；第一次使用會下載 Gemini Nano 模型
- 只在 `kkday.com`（含子網域）運作

## 安裝（載入未封裝的 extension）

先 build，再從 Chrome 載入 `dist/`：

```bash
pnpm install
pnpm run build
```

1. 打開 `chrome://extensions`
2. 開啟右上角「開發人員模式」
3. 點「載入未封裝項目」，選本專案的 `dist/` 資料夾
4. 打開 kkday.com 上任一頁面，右下角就會出現小夥伴

## 設定（popup）

點瀏覽器工具列的 extension 圖示開啟設定。設定存在 `chrome.storage.local`，跨分頁即時同步（存檔後已開啟的分頁馬上套用）：

- **語氣**：幽默😜／正經🧐／溫柔🤗／熱血🔥／厭世🥱／文青🌸（預設幽默）。透過 `sharedContext` 影響模型口吻。
- **摘要類型**：對應 Summarizer API 的 `type`——重點 / 懶人包 / 開場白 / 標題。

語氣與摘要類型不同會各自快取。原始碼在 [`src/popup/`](src/popup)，資料層在 [`src/lib/settings.ts`](src/lib/settings.ts)。

## 開發

本專案用 [pnpm](https://pnpm.io/)（`packageManager` 已鎖版本；`.npmrc` 設 `node-linker=hoisted`，讓 tsc 找得到型別）。

```bash
pnpm install
pnpm run dev          # watch mode
pnpm run build        # 產出 dist/
pnpm run typecheck    # tsc --noEmit
pnpm test             # vitest（jsdom 環境）
pnpm run test:watch   # vitest watch
```

測試涵蓋內容擷取、快取 / TTL、設定 merge、各功能的狀態機（React Testing Library）與 stub 掉的 Chrome AI API。

實作細節與各功能的運作原理見 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 打包成 zip（上架 / 分發）

```bash
pnpm run package
```

依序跑 typecheck → 測試 → build，再用 [web-ext](https://github.com/mozilla/web-ext) 把 `dist/` 打包成 `release/summarize_ai_buddy-<version>.zip`（版本號讀自 `manifest.json`）。這個 zip 可直接上傳到 [Chrome Web Store 開發者後台](https://chrome.google.com/webstore/devconsole) 或分享給別人手動安裝。`release/` 已列入 `.gitignore`，每次執行用 `--overwrite-dest` 覆蓋舊檔。

> 發新版本前，記得先更新 [`public/manifest.json`](public/manifest.json) 的 `version` 欄位。上架文案見 [`docs/store-listing.md`](docs/store-listing.md)。

## 本機預覽（免安裝 extension）

`demo/` 底下有測試頁，stub 掉 `chrome.runtime` 與 `Summarizer`，可直接開 `demo/index.html`（文章頁）或 `demo/homepage.html`（非文章頁 + 垃圾過濾）看 UI 與擷取行為。需先 `pnpm run build`（demo 的 `content.js` 由 `dist/` 複製而來，已列入 `.gitignore`）。

## 專案結構

```
public/            MV3 manifest、sprite、emoji 等資產（原樣複製進 dist）
src/               content script 進入點、小夥伴編排（Buddy / content.tsx）
src/components/    UI 元件：各 buddy、商品摘要卡片、翻譯按鈕、頭像 / 反應列
src/hooks/         流程與狀態機：摘要、商品摘要、值不值得、評論潤飾 / 翻譯、model gate、設定
src/lib/           資料層：內容擷取、商品 / 評論頁偵測、各 AI API 包裝、快取、設定
src/popup/         設定頁面（獨立 extension 頁面，非 Shadow DOM）
demo/              免安裝本機預覽頁
docs/              ARCHITECTURE、隱私權政策、上架文案
```

各檔案職責與實作細節見 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。
