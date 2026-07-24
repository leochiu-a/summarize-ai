// buddy 各模式共用的生命週期狀態。原本 useSummarizer / useWorthIt 各有一組命名不同、
// 語義相同的 phase，統一成這一組後，外殼（BuddyBubble）只認 phase 就能推出畫面狀態。
//
// - idle：未開始（只有頭像）
// - thinking：準備中，模型還沒吐字（顯示碎念台詞）
// - needs-activation：模型待下載，需再一次使用者手勢
// - streaming：串流中，邊生成邊顯示內容
// - done：完成
// - error：出錯
export type BuddyPhase = 'idle' | 'thinking' | 'needs-activation' | 'streaming' | 'done' | 'error'

// 由 phase 推導外殼要的布林狀態，集中一處，避免每個模式在外面各判斷一次。
export const isOpen = (p: BuddyPhase) => p !== 'idle'
export const isThinking = (p: BuddyPhase) => p === 'thinking'
export const isStreaming = (p: BuddyPhase) => p === 'streaming'
export const isBusy = (p: BuddyPhase) => p === 'thinking' || p === 'streaming'
export const isDone = (p: BuddyPhase) => p === 'done'
export const needsActivation = (p: BuddyPhase) => p === 'needs-activation'
