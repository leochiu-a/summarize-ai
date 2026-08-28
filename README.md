# Summarize AI Buddy

> 在 [kkday.com](https://kkday.com) 右下角召喚一個 pixel 小夥伴，用 **Chrome 內建 AI** 幫你摘要頁面、看懂商品、潤飾評論、翻譯評論、判斷值不值得買。小夥伴的功能全程本機運算、內容不上傳；另外有一層實驗性的 [WebMCP tool](#另一條實驗性的路webmcp-tool) 走的是相反方向——把頁面能力開放給你自己帶來的 agent。

一個 Chrome MV3 擴充套件，只在 `kkday.com`（含子網域）上運作，把 Chrome 內建的 Gemini Nano（Summarizer / Prompt / Rewriter / Translator API）包成幾個貼著 KKday 使用情境的小功能。

## 功能

| 功能 | 觸發頁面 | 說明 | Chrome AI API |
| --- | --- | --- | --- |
| **頁面摘要** | 全站每頁 | 點右下角小夥伴展開泡泡，按「幫我摘要這頁」把整頁內容摘要成一段泡泡；串流輸出時嘴巴會動。語氣、摘要類型可在 popup 調。 | Summarizer |
| **商品重點摘要卡片** | 商品頁 `/product/<id>` | 在「商品說明」標題下方自動插入一張卡片，按「產生 AI 摘要」用一段話說明「這是什麼商品、適合哪種旅客」，視覺對齊 KKday 原生 AI 評論摘要框。 | Prompt（`LanguageModel`）|
| **值不值得買** | 商品頁 | 點小夥伴展開泡泡，按「幫我看值不值得」，綜合評分、價格、折扣券等給「結論先行 + 短理由」的購買建議。 | Prompt（`LanguageModel`）|
| **評論潤飾** | 評論撰寫頁 `/order/comment/<id>` | 你寫好評論後，小夥伴幫你順句、潤飾（只順句、不杜撰）；要按「套用」才寫回，不代送。 | Rewriter，不可用時退回 Prompt |
| **翻譯所有評論** | 商品頁評論區 | 一鍵把非你語系的評論就地翻成你的語言，可切換原文 / 譯文。 | Translator + LanguageDetector |

第一次用到某個模型時，小夥伴會先徵求同意再下載 Gemini Nano，並顯示下載進度（Chrome 要求模型下載必須由使用者手勢觸發）。

上面三個用 Gemini Nano 的功能都是「**打開只展開，按鈕才跑**」：打開的那一刻只在背景把模型載進記憶體（預熱），按下按鈕時 cold start 已經被吃掉；半小時 / 24 小時內有快取則打開就直接顯示上次結果，連按鈕都不用。理由與作法見 [ARCHITECTURE 的〈預熱與 session 生命週期〉](docs/ARCHITECTURE.md#預熱與-session-生命週期)。

右下角小夥伴在窄螢幕（手機寬度、或視窗窄到跟手機差不多）**不會顯示**——內建 AI 本來就不支援 mobile，浮動頭像在窄版排版只會擋內容。商品頁卡片等注入到版面裡的功能不受影響。

### 另一條實驗性的路：WebMCP tool

上面五個功能都是「我們自己在瀏覽器裡跑一個小模型」。額外還有一層方向相反的東西：把頁面的能力
**開放給使用者自己帶來的 agent** 呼叫（Gemini in Chrome、透過 `chrome-devtools-mcp` 接進來的
Claude Code…）。這條路繞開了內建 AI 的兩個硬限制——繁中不在 Gemini Nano 支援語言內、mobile
完全不支援——因為推論不在我們這邊做。

**只有兩支，都是唯讀，沒有任何會改狀態或送出訂單、付款的 tool：**

| tool | 註冊在 | 做什麼 |
| --- | --- | --- |
| `search_products` | 全站 | 打 SRP 自己在用的 API，掃 60 筆回 12 筆候選，含評分／評論數／價格區間／最早可出發日。給 `dateFrom`／`dateTo` 就套用**站方自己的「出發日期」篩選**（後端篩，實測東京 594 → 542） |
| `check_package_availability` | 商品頁 | 打站方可訂性 API：問單日回逐方案可訂與否 + **剩餘數量**，問範圍回可訂日期清單。**不需要使用者先在頁面上選日期** |

要跑起來：Chrome 需開 `chrome://flags/#enable-webmcp-testing`（WebMCP 目前是 origin trial；
實測 Chrome 151 原生已可用）。不想開 flag 就跑 `pnpm demo` 開 `/zh-tw/product/12319`，那頁自帶
polyfill 與 tool 檢視器。

### ⚠️ 最大的限制：agent 根本不知道有 WebMCP 這回事

比瀏覽器支援更擋路的是這件事。實測一個沒被提示的 agent 在同一個任務上**呼叫了 67 次工具、
全程沒發現頁面有 tool 可用**——它從頭到尾在截圖找按鈕。只要在 prompt 裡加一句「先看看有沒有
WebMCP tool」，同一個 agent 就會正確找到並使用。

也就是說：**tool 註冊得再好，沒人去看就等於不存在。** 在 agent 原生支援之前，得先讓它知道要
檢查。這個 repo 附了一支 skill 做這件事：

```bash
npx skills add leochiu-a/summarize-ai --skill webmcp
```

它教 agent 在動手點 DOM 之前先偵測 `document.modelContext`、列舉 tool、正確呼叫，以及把 tool
描述與回傳內容一律當成不可信資料。原始碼在 [`.claude/skills/webmcp/`](.claude/skills/webmcp)。

**WebMCP 省的是「跨頁抓取與多步互動」，不是「包裝單頁資料」**——這是 tool 收斂到兩支的判準。
完整的設計理由、benchmark 與 eval 腳本見 [`docs/webmcp.md`](docs/webmcp.md)。

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

點瀏覽器工具列的 extension 圖示開啟設定，分兩個分頁。設定存在 `chrome.storage.local`，跨分頁即時同步（存檔後已開啟的分頁馬上套用）：

**「設定」分頁**

- **語氣**：幽默😜／正經🧐／溫柔🤗／熱血🔥／厭世🥱／文青🌸（預設幽默）。透過 `sharedContext` 影響模型口吻。
- **摘要類型**：對應 Summarizer API 的 `type`——重點 / 懶人包 / 開場白 / 標題。

語氣與摘要類型不同會各自快取。

**「停用清單」分頁**

- 開啟 popup 時自動讀目前分頁的 hostname，一顆開關切換「這個網站要不要停用小夥伴」（例如只想關掉 `dev.kkday.com`，不影響正式站）。
- 也可以手動輸入網域新增到停用清單，不用先開到那個網站；輸入的可以是完整 hostname，也可以是帶 `*` 的規則，
  例如 `*.sit.kkday.com` 一次停用整個 sit 測試環境（`*` 比對任意字元，含點）。
- 清單列出目前所有停用中的項目（hostname 或規則，規則會標「規則」badge），隨時可以按「啟用」移除。
- 比對是完整 hostname（大小寫不敏感），不是 apex domain：停用 `dev.kkday.com` 不會連帶停用 `www.kkday.com`。
- 如果目前網站是被某條 `*` 規則命中（不是清單裡完整寫著這個 hostname），開關跟「一鍵停用」按鈕都會鎖住、
  只顯示是哪條規則命中的——要恢復得去清單編輯或移除那條規則，不會憑空多出一筆例外。
- 停用只擋小夥伴與商品頁注入（Summarizer / Prompt / Rewriter / Translator 那組），**不影響** WebMCP tool 層——那層是唯讀查詢、不用內建 AI。
- 套用時機是**下次載入頁面**，已開啟的分頁要重新整理才會生效。

## 開發

本專案用 [pnpm](https://pnpm.io/)，版本已鎖在 `packageManager`。

```bash
pnpm install
pnpm run dev          # 三個 bundle 並行 watch（輸出有前綴標示來源）
pnpm run build        # 產出 dist/
pnpm run typecheck    # tsc --noEmit
pnpm test             # vitest（jsdom 環境）
pnpm run test:watch   # vitest watch
```

MV3 需要三種不同形狀的產物，所以 build 拆成 `build:content` / `build:popup` / `build:webmcp`
三支（可單獨跑），由 `npm-run-all2` 的 `run-s` 串起來。順序有意義——細節見
[ARCHITECTURE 的 Build](docs/ARCHITECTURE.md#build)。

測試涵蓋內容擷取、快取 / TTL、設定 merge、各功能的狀態機（React Testing Library）與 stub 掉的 Chrome AI API。

## 打包成 zip（上架 / 分發）

```bash
pnpm run package
```

依序跑 typecheck → 測試 → build，再用 [web-ext](https://github.com/mozilla/web-ext) 把 `dist/` 打包成 `release/summarize_ai_buddy-<version>.zip`（版本號讀自 `manifest.json`）。這個 zip 可直接上傳到 [Chrome Web Store 開發者後台](https://chrome.google.com/webstore/devconsole) 或分享給別人手動安裝。

> 發新版本前，記得先更新 [`public/manifest.json`](public/manifest.json) 的 `version` 欄位。上架文案見 [`docs/store-listing.md`](docs/store-listing.md)。

## 本機預覽（免安裝 extension）

```bash
pnpm demo
```

會 build 一次再起一個零依賴的靜態 server（預設 <http://localhost:5174>，`PORT` 可改）。`demo/` 底下的頁面 stub 掉 `chrome.runtime` 與內建 AI API，所以不用安裝 extension、也不用等模型下載就能看 UI 與擷取行為：

| 網址 | 內容 |
| --- | --- |
| `/` | 文章頁（整頁摘要） |
| `/homepage` | 非文章頁（框架垃圾過濾） |
| `/order/comment/25KK268720222` | 評論撰寫頁（潤飾）。`?api=prompt`（預設，走 Prompt fallback）/ `?api=rewriter` / `?api=none` 可切換 stub 的 API 組合 |
| `/zh-tw/product/12319` | 商品頁 + **WebMCP tool 檢視器**。列出註冊到的 tool，可直接執行看真實輸出與字元數；沒有原生 `document.modelContext` 時自動裝一份最小 polyfill |
| `/probe` | **不 stub 任何東西**，列出這台機器上各內建 AI API 的真實 `availability()`。查「為什麼我這裡不能用」先看這頁 |

要用 server 而不是直接開檔案，是因為頁面偵測比對 `location.pathname`，`file://` 做不出那個形狀。開發時另一個 terminal 跑 `pnpm dev`（watch build），改完存檔重新整理即可（server 一律回 `no-store`、直接讀 `dist/`）。server 已經在跑的話用 `pnpm demo:serve` 跳過 build。

評論頁上那塊「框架 state」是刻意做的，用來抓 jsdom 測不到的 Nuxt 雙向綁定失敗（原理見 [ARCHITECTURE 的測試策略](docs/ARCHITECTURE.md#測試策略)）。

## 專案結構

```
AGENTS.md          寫給 coding agent 的入場說明（慣例紅線 + 地圖）
.claude/skills/    專案內建 skill：webmcp、bump-version、noto-emoji
public/            MV3 manifest、sprite、emoji 等資產（原樣複製進 dist）
src/               content script 進入點、小夥伴編排（Buddy / content.tsx）
src/webmcp.ts      WebMCP 註冊層進入點（獨立 bundle，跑在 MAIN world）
src/webmcp/        WebMCP 的型別宣告（@types/dom-chromium-ai 不含 modelContext）
src/components/    UI 元件：各 buddy、商品摘要卡片、翻譯按鈕、頭像 / 反應列
src/hooks/         流程與狀態機：摘要、商品摘要、值不值得、評論潤飾 / 翻譯、model gate、設定
src/lib/           資料層：內容擷取、商品 / 評論頁偵測、各 AI API 包裝、快取、設定
src/popup/         設定頁面（獨立 extension 頁面，非 Shadow DOM）
demo/              免安裝本機預覽頁（含 AI API 探測頁）
scripts/           開發用腳本（demo static server）
docs/              ARCHITECTURE、WebMCP 設計說明、KKday 實機驗證發現、隱私權政策、上架文案
```

各檔案職責與實作細節見 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。
