// Gemini Nano consent gate 的 React 狀態機（A 組共用）。
//
// 職責：把 modelGate 的同步/非同步 availability 包成 React 狀態，讓 Buddy 決定
// 「是否要先問使用者同意下載」。流程：
//   unknown（冷啟動先 refresh）→ ready（已就緒，直接交給功能）
//                              ↘ consent（未就緒，顯示同意提示）
//   consent →（使用者同意）→ downloading（顯示進度）→ done（就地復活提醒）
//                                                    ↘ error
//
// 設計原則：
// - 同步初值優先用 modelGate 的快取（零閃現）；沒快取才 async refresh。
// - 下載只在使用者手勢（點同意）內觸發，對齊「同意才下載」。

import { useCallback, useEffect, useState } from 'react'
import {
  downloadGeminiNano,
  geminiNanoAvailabilitySync,
  onGateChange,
  refreshGeminiNano,
} from '../lib/modelGate'

// unknown：還沒判斷（冷啟動校正中）
// ready：base model 已就緒，功能可直接用
// consent：未就緒，等使用者同意下載
// downloading：下載中（顯示進度）
// done：下載完成（提醒就地可用）
// error：出錯 / 裝置不支援
export type GateState = 'unknown' | 'ready' | 'consent' | 'downloading' | 'done' | 'error'

export interface ModelGate {
  state: GateState
  downloadPct: number | null // 下載進度（0~100），非下載中為 null
  error: string
  accept: () => Promise<void> // 使用者同意 → 觸發下載（須在點擊手勢內呼叫）
}

// 裝置不支援內建 AI 的錯誤訊息（同步初值與冷啟動校正共用）
const UNAVAILABLE_MSG = '這台裝置無法使用內建 AI 模型（需要 Chrome 138+ 且符合硬體需求）。'

// 把 availability 對應成初始 gate 狀態
function stateFromAvailability(a: ReturnType<typeof geminiNanoAvailabilitySync>): GateState {
  if (a === null) return 'unknown'
  if (a === 'available') return 'ready'
  if (a === 'unavailable') return 'error'
  return 'consent' // downloadable / downloading → 要問同意
}

export function useModelGate(): ModelGate {
  // 同步初值：有快取就直接定狀態（零閃現），沒有才 unknown 等 refresh
  const initial = stateFromAvailability(geminiNanoAvailabilitySync())
  const [state, setState] = useState<GateState>(initial)
  const [downloadPct, setDownloadPct] = useState<number | null>(null)
  // 同步初值就是 error（裝置不支援）時，一併帶上錯誤訊息，避免顯示空白錯誤
  const [error, setError] = useState(initial === 'error' ? UNAVAILABLE_MSG : '')

  // 冷啟動校正：只在還沒判斷（unknown）時 async refresh 一次
  useEffect(() => {
    if (state !== 'unknown') return
    let alive = true
    void refreshGeminiNano().then((a) => {
      if (!alive) return
      if (a === 'unavailable') {
        setError(UNAVAILABLE_MSG)
        setState('error')
      } else {
        setState(a === 'available' ? 'ready' : 'consent')
      }
    })
    return () => {
      alive = false
    }
  }, [state])

  // 訂閱 gate 變化：別的進入點（或本頁下載）完成後校正到 available → 本 buddy 也就緒
  useEffect(() => {
    return onGateChange((a) => {
      if (a === 'available') setState((s) => (s === 'downloading' ? s : 'ready'))
    })
  }, [])

  const accept = useCallback(async () => {
    setError('')
    setDownloadPct(null)
    setState('downloading')
    try {
      await downloadGeminiNano((loaded) => setDownloadPct(Math.round(loaded * 100)))
      setState('done') // 下載完成：提醒使用者功能已就緒（同頁其他 UI 靠 onGateChange 就地復活）
    } catch (err) {
      setError(`模型下載失敗：${err instanceof Error ? err.message : String(err)}`)
      setState('error')
    }
  }, [])

  return { state, downloadPct, error, accept }
}
