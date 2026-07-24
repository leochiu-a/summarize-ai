// 商品說明摘要：用 Prompt API（LanguageModel）串流輸出「一段話」。
// 型別由 @types/dom-chromium-ai 提供（tsconfig types 已引入）。

// 用 LanguageModel.availability 判斷模型狀態；不支援 API 時視為 unavailable
export async function availability(): Promise<Availability> {
  if (typeof LanguageModel === 'undefined') return 'unavailable'
  return LanguageModel.availability()
}

// 給模型的指示：濃縮成「一段話」，聚焦「這是什麼 + 適合哪種旅客」，不要條列 / Markdown。
// 語氣（tonePrompt）沿用 popup 設定（見 lib/settings 的 TONES）。
function buildInstruction(tonePrompt: string): string {
  return (
    '請用繁體中文（台灣），把以下 KKday 商品說明濃縮成「一段話」（約 2～3 句，不要分段、' +
    '不要條列、不要標題或 Markdown 符號如 # 或 *）。內容聚焦兩件事：這是什麼樣的商品，' +
    '以及最適合哪一種旅客（用「如果你是……，這很適合你」這種口吻收尾）。只根據內文、不要杜撰。' +
    `\n語氣：${tonePrompt}\n\n商品說明：\n`
  )
}

// 串流產生摘要：把累積到目前的文字透過 onChunk 往 UI 送，最後回傳完整內容。
// tonePrompt 來自 popup 的語氣設定，注入指示影響輸出口吻。
export async function generateProductSummary(
  text: string,
  tonePrompt: string,
  onChunk?: (accumulated: string) => void,
): Promise<string> {
  if (typeof LanguageModel === 'undefined') {
    throw new Error('這個瀏覽器不支援內建 Prompt API（需要 Chrome 138+，且裝置符合硬體需求）。')
  }

  const session = await LanguageModel.create()
  try {
    let acc = ''
    // promptStreaming 逐塊吐出「新增」的片段（delta），自行累加
    for await (const chunk of session.promptStreaming(buildInstruction(tonePrompt) + text)) {
      acc += chunk
      onChunk?.(acc)
    }
    return acc
  } finally {
    session.destroy()
  }
}
