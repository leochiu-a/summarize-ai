# Summarize AI Buddy

Chrome extension：網頁右下角會出現一個 pixel 小夥伴，點他就會用 Chrome 內建的 [Summarizer API](https://developer.chrome.com/docs/ai/summarizer-api) 摘要目前頁面，串流輸出時嘴巴會動、像在講話。

## 需求

- Chrome 138+（Summarizer API 內建於穩定版）
- 裝置需符合內建 AI 硬體需求（>4GB VRAM、>22GB 可用空間；第一次使用會自動下載 Gemini Nano 模型）

## 開發

```bash
npm install
npm run build        # 產出 dist/
npm run dev          # watch mode
```

使用 [Vite Plus](https://viteplus.dev) 打包，content script 輸出為單一 IIFE（`dist/content.js`）。

## 載入 extension

1. 打開 `chrome://extensions`
2. 開啟右上角「開發人員模式」
3. 點「載入未封裝項目」，選擇本專案的 `dist/` 資料夾
4. 打開任何文章頁面，右下角就會出現小夥伴，點他開始摘要

## 結構

```
public/manifest.json      # MV3 manifest（原樣複製進 dist）
public/assets/sprite.png  # 3 格 sprite sheet（閉嘴 / 半開 / 張嘴）
src/content.ts            # widget UI + 內容擷取 + Summarizer 串流 + 講話動畫
vite.config.ts            # IIFE 打包設定
```
