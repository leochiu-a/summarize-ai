// 摘要完成後可按的反應 emoji 資料
// code 對應 Google Noto emoji 檔名：靜態 assets/emoji/<code>.svg、動畫 <code>.webp

export interface Reaction {
  code: string
  label: string
  lines: string[]
}

export const REACTIONS: Reaction[] = [
  { code: '1f44d', label: '讚', lines: ['嘿嘿，不錯吧', '我就知道你會喜歡', '這摘要品質沒話說吧'] },
  { code: '1f44e', label: '爛', lines: ['蛤？我可是很認真讀的欸', '好啦下次我會更用心…', '你行你來摘啊'] },
  { code: '1f634', label: '無聊', lines: ['這篇是真的有點無聊啦…', '我唸的時候也差點睡著', '別怪我，原文就這樣'] },
  { code: '1f92f', label: '驚', lines: ['對吧！我第一次看也嚇到', '資訊量有點大齁', '很猛吧這篇'] },
  { code: '2764_fe0f', label: '愛', lines: ['別這樣，我會害羞啦', '嘿嘿，過獎了', '愛你喔（欸不是）'] },
]
