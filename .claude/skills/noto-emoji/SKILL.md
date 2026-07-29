---
name: noto-emoji
description: >
  Pick, verify, download and wire up a Google Noto animated emoji for this
  extension's UI (EmojiIcon + bundled assets in public/assets/emoji). Use when
  adding or changing any emoji in the buddy, the popup, a button or a card —
  including "找個合適的 emoji", "這顆 emoji 有動畫嗎", "加一個 emoji 到按鈕上",
  or when you are about to type a raw emoji character into UI copy.
---

# 加一顆 Noto emoji 到 UI

這個 extension 的 emoji 都是 [Google Noto animated emoji](https://googlefonts.github.io/noto-emoji-animation/)
的資產，**隨包打進去、不連外部網路**（隱私政策承諾全本機，離線也要能用）。
UI 上不要出現裸 emoji 字元——那會用系統字體渲染，跟其他地方不一致，也沒有動畫。

機制：[`EmojiIcon`](../../../src/components/EmojiIcon.tsx) 同時渲染兩張圖，
預設顯示靜態 `.svg`，hover（或 `.on` 祖先）時 CSS 換成動畫 `.webp`。

## Step 1：先確認這顆有沒有動畫版

**整個 gallery 只有 881 顆有動畫（2026-07 實測），沒有的會 404。**
一定要先驗再答應使用者，不要憑印象——很多你以為理所當然會有的都沒有。

```bash
for c in 1f440 2728 1f50d; do
  printf "%s → " "$c"
  curl -s -o /dev/null -w "%{http_code} %{size_download}bytes\n" \
    "https://fonts.gstatic.com/s/e/notoemoji/latest/$c/512.webp"
done
```

`<code>` 是 Unicode codepoint 小寫、去掉 `U+`，多段用 `_` 接（`2764_fe0f`）。
`200` = 有動畫，`404` = 沒有（只能換一顆）。

實測沒有動畫版的常見顆數，別再試：🔍 `1f50d`、📝 `1f4dd`、💰 `1f4b0`、📄 `1f4c4`、
🧾 `1f9fe`、💭 `1f4ad`、📰 `1f4f0`、💳 `1f4b3`、📖 `1f4d6`、⏱️ `23f1_fe0f`、🛍️ `1f6cd_fe0f`。

## Step 2：先看能不能重用已經內建的

```bash
ls public/assets/emoji/
```

動畫 webp 是 100KB～1MB（🧐 `1f9d0` 就 1.1MB），資產目錄已經 5MB 以上。
**已內建的那幾顆是 0 成本**——語氣（`src/lib/settings.ts` 的 `TONES`）、反應列
（`src/lib/reactions.ts`）、⚡ 重做（`26a1`）、😜 consent 完成（`1f61c`）用到的都在裡面。
先問「現有的能不能表達這個意思」，再考慮新增。`curl` 出來的 `size_download` 就是要新增的體積，
挑之前先看一眼。

## Step 3：下載兩個檔

```bash
cd public/assets/emoji
for c in <code1> <code2>; do
  curl -sfS -o "$c.svg"  "https://fonts.gstatic.com/s/e/notoemoji/latest/$c/emoji.svg"
  curl -sfS -o "$c.webp" "https://fonts.gstatic.com/s/e/notoemoji/latest/$c/512.webp"
done
```

檔名就是 `<code>`，不要改。驗一下拿到的是真檔案而不是錯誤頁：

```bash
file <code>.svg <code>.webp            # 應為 SVG image / RIFF Web/P
head -c 60 <code>.webp | strings       # 應看到 VP8X ANIM ANMF（有動畫）
```

## Step 4：接到 UI

按鈕（已有文字）→ emoji 是裝飾，**省略 `label`** 讓 `alt=""` 把它從 a11y tree 移除，
不然讀螢幕會把按鈕文字念兩次：

```tsx
<button type="button" className="buddy-btn primary" onClick={onStart}>
  <EmojiIcon code="1f440" />
  幫我摘要這頁
</button>
```

只有 emoji、沒有文字的按鈕（反應列）→ 要傳 `label`，它就是 accessible name。

## Step 5：補 hover 換動畫的 CSS

`EmojiIcon` 只給 `.emoji-static` / `.emoji-anim` 兩個 class，「什麼時候換」由各自的 CSS 決定。
**每個 shadow root 各自注入一份樣式**，所以要看你的元件屬於哪一份：

- 小夥伴（`src/content.css`）：已有 `.emoji-static` / `.emoji-anim` 基底與 `.buddy-btn:hover` 規則。
- 商品摘要卡片（`src/productSummary.css`）：**沒有** content.css，基底規則要自己寫一份
  （`.ps-activate` 那段可以照抄）。
- popup（`src/popup/popup.css`）：另一份，非 Shadow DOM。

```css
.my-btn .emoji-static,
.my-btn .emoji-anim { width: 18px; height: 18px; margin-right: 6px; display: block; }
.my-btn .emoji-anim { display: none; }
.my-btn:hover .emoji-static { display: none; }
.my-btn:hover .emoji-anim { display: block; }
```

18px 配 14px 的按鈕文字剛好；父層記得 `display: inline-flex; align-items: center`。

## Step 6：目視驗證（jsdom 測不到圖片有沒有載到）

```bash
pnpm run build && pnpm run demo:serve
```

在 demo 頁的 console 抓 shadow root 檢查——`naturalWidth` 是 0 就代表資產 404 了：

```js
const sr = document.getElementById('summarize-ai-buddy-host').shadowRoot
;[...sr.querySelectorAll('.buddy-btn img')].map(i =>
  `${i.className}:${getComputedStyle(i).display}:${i.naturalWidth}px`)
// 預期：emoji-static:block:150px / emoji-anim:none:0px
// hover 之後：  emoji-static:none:150px / emoji-anim:block:512px
```

商品頁（`/zh-tw/product/<id>`）的 demo 沒有 content script 也沒有 `LanguageModel` stub，
要驗那裡的卡片得自己在 console 補 stub 再注入 `/content.js`（見 `AGENTS.md`）。

## 最後

`pnpm test` 應該不會壞：裝飾用的 `alt=""` 不影響按鈕的 accessible name，
`getByRole('button', { name: '…' })` 照樣命中。真的壞了先確認是不是不小心傳了 `label`。
