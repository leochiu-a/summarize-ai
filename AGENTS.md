# AGENTS.md

寫給 coding agent 的入場說明。只放「不知道會踩雷」的慣例與地圖；實作細節在
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)，使用說明在 [`README.md`](README.md)。

## 這是什麼

Chrome MV3 擴充套件，只在 `kkday.com`（含子網域）運作，把 Chrome 內建 AI
（Summarizer / Prompt / Rewriter / Translator）包成幾個貼著 KKday 情境的小功能。
推論全在本機、內容不上傳——這是[隱私權政策](docs/privacy-policy.html)的承諾，別加任何把頁面內容送去外部
API 的路徑。唯一的例外是 WebMCP tool 層（`src/webmcp.ts`），它是反過來把頁面能力開放給
使用者自己帶來的 agent，那層不用內建 AI。

```bash
pnpm install
pnpm run dev        # 三個 bundle 並行 watch
pnpm run build      # 產出 dist/
pnpm run typecheck  # tsc --noEmit
pnpm test           # vitest（jsdom）
pnpm demo           # build 一次 + 起本機預覽 server（見下方）
```

MV3 需要三種形狀的產物，所以 build 拆成 `build:content` / `build:popup` / `build:webmcp`。

## 紅線

### 1. emoji 一律用內建的 Noto 資產，不要連外部網路

圖示走 [`src/components/EmojiIcon.tsx`](src/components/EmojiIcon.tsx)，資產是
`public/assets/emoji/<code>.svg`（靜態，預設顯示）+ `<code>.webp`（動畫，hover 才播）。
**不要**直接引用 `fonts.gstatic.com` 的 URL——extension 要能離線運作，資產一律隨包打進去。

要新增一顆 emoji 走 `.claude/skills/noto-emoji/`（有動畫版與否要先驗、檔案 100KB～1MB 不小）。

> 目前 [`ReviewBuddy.tsx`](src/components/ReviewBuddy.tsx) 的引導台詞裡還有裸 emoji 字元
> （✨💪✍️，用系統字體渲染）。那是既有寫法，新的 UI 元件請一律走 EmojiIcon。

### 2. 三個 AI 功能都是「打開只展開 + 背景預熱 → 按鈕才推論」

頁面摘要、值不值得買、商品重點摘要卡片**都不會**在打開的那一刻跑模型：
只 `prepare()`（有快取直接顯示上次結果，沒快取才背景 `create()` 預熱），使用者按下按鈕才推論。
別「順手」改回掛載即跑或點頭像即跑——那是刻意移除的行為，理由與 Chrome 官方
[Do's and Don'ts](https://developer.chrome.com/docs/ai/built-in-ai-dos-donts) 的對應寫在
[ARCHITECTURE 的〈預熱與 session 生命週期〉](docs/ARCHITECTURE.md#預熱與-session-生命週期)。

連帶的兩件事：

- session 由 [`src/lib/warmSession.ts`](src/lib/warmSession.ts) 的 warm slot 持有
  （`warm` / `take` / `release`）。**slot 是模組級狀態**——測試的 `afterEach` 一定要呼叫對應的
  `releaseSummarizer()` / `releaseWorthIt()` / `releaseProductSummary()`，否則下一個測試會沿用
  上一個 stub 建出來的 session，`create` 次數的斷言會莫名其妙。
- Prompt API 的規則類指示放在 `create({ initialPrompts: [{ role: 'system', … }] })`，
  `promptStreaming()` 只送資料，每次執行 `clone()` 一份用完就 destroy（baseline 留著）。
  所以測試的 `LanguageModel` stub **必須有 `clone()`**。

### 3. buddy 的模式是自足元件，共用外殼只認 phase

`Buddy.tsx` 只負責「選誰上場」（review / worth / summary），每個模式自己持有 hook 與流程。
共用外殼 [`BuddyBubble.tsx`](src/components/BuddyBubble.tsx) 只認
[`BuddyPhase`](src/lib/buddyPhase.ts)，模式差異用 `view` + `openWhenIdle` / `actions` 帶進去——
要加「展開但還沒開始」的提示狀態時用這兩個 prop，不要在外殼裡塞模式專屬邏輯。

### 4. 不要綁 KKday 的 Vue 內部細節

頁面偵測與定位只用 URL 形狀、id、ARIA role、標題文字反查，**不要**綁 `data-v-*` 或樣式 class
（改版就掃到）。商品頁的卡片注入還要等 hydration 完成才插入，否則會被 Vue 重繪洗掉——
細節在 [`src/productPageSummary.ts`](src/productPageSummary.ts) 的註解。

## demo（`pnpm demo`）的兩個坑

本機預覽頁在 `demo/`，server 是 [`scripts/demo-server.mjs`](scripts/demo-server.mjs)。

- **資產由 server 對應到 `dist/`**：`/assets/**` → `dist/assets/**`，`/content.js` → `dist/content.js`。
  不要把 sprite / emoji `cp` 進 `demo/`（`.gitignore` 裡 `demo/assets/` 是舊做法的殘留）。
  改完程式跑 `pnpm dev` 再重新整理即可，server 一律回 `no-store`。
- **demo 的 `chrome.runtime.getURL` stub 要回 `'/' + path`**：巢狀路徑（`/order/comment/<id>`、
  `/zh-tw/product/<id>`）用相對路徑會 404，頭像與 emoji 會變破圖。

`demo/product.html` 只載 `webmcp.js`（它是 WebMCP tool 檢視器），**沒有** content script 也沒有
`LanguageModel` stub。要在那頁看小夥伴或商品摘要卡片，得自己在 console 補 stub 再注入
`/content.js`。

## 改動之後

`pnpm run typecheck` 與 `pnpm test` 都要綠。動到 UI 行為時，實際在 `pnpm demo` 上點一遍
（`/` 有 stub 好的 Summarizer，可以走完整頁摘要的兩段式流程），別只靠 jsdom 測試。
功能行為有變就順手更新 `README.md` 的功能表格與 `docs/ARCHITECTURE.md` 的對應段落。
