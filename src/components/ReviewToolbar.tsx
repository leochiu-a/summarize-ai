// 評論撰寫頁的 AI 工具列：直接長在評論輸入框底下的一排按鈕。
//
// 為什麼不是小夥伴：寫評論的人視線在輸入框，動線也在輸入框——把「幫我潤一下」藏在右下角的
// 泡泡裡，等於要他先發現一隻寵物、再點開、再讀完引導才拿得到功能。按鈕就在框下面，
// 想用就點，不想用完全不擋路（評論頁因此不再掛小夥伴，見 content.tsx）。
//
// 四顆按鈕對應 useReviewAssist 的四個動作，能不能按由「他寫了多少字」決定：
// - 一個字都還沒寫 → 只有「給我開頭」能按，其餘會告訴他先寫幾句
// - 寫了幾句 → 潤飾 / 再多寫一點 / 換個語氣 全開，「給我開頭」關掉（已經有內容了）
//
// 產出一律先進下方的結果面板，按「套用」才寫回輸入框，永遠不代送。
//
// 模型 gate 也由這裡自己處理（這頁沒有 ConsentBuddy 了）：沒就緒就先顯示一顆「啟用」按鈕，
// 點擊本身即為 Chrome 要求的使用者手勢；裝置不支援時只留一行灰字，不擋著他寫評論。

import { useCallback, useEffect, useState } from 'react'
import { useModelGate } from '../hooks/useModelGate'
import { useReviewAssist } from '../hooks/useReviewAssist'
import type { AssistAction } from '../lib/reviewAssist'
import { watchReviewDraft } from '../lib/reviewPage'
import { TONES, type ToneId } from '../lib/settings'
import { EmojiIcon } from './EmojiIcon'

// 寫到這個字數才有東西可以潤（太短的句子潤了也只是換句話說）
const MIN_DRAFT = 15

interface ActionSpec {
  id: AssistAction
  label: string
  // 這個動作在目前字數下能不能按；不能按時要說的話（點下去才顯示，不預先擋成一片灰）
  enabled: (len: number) => boolean
  blockedHint: string
}

const ACTIONS: ActionSpec[] = [
  {
    id: 'polish',
    label: '潤飾這段',
    enabled: (len) => len >= MIN_DRAFT,
    blockedHint: '先寫幾句你的心得，我再幫你潤得更順。',
  },
  {
    id: 'opening',
    label: '寫不出來？給我開頭',
    enabled: (len) => len === 0,
    blockedHint: '你已經開始寫了，試試「潤飾這段」或「再多寫一點」。',
  },
  {
    id: 'expand',
    label: '再多寫一點',
    enabled: (len) => len >= MIN_DRAFT,
    blockedHint: '先寫幾句，我才知道要往哪裡展開。',
  },
]

// 結果面板的抬頭：讓使用者知道下面這段是哪一顆按鈕生出來的
const RESULT_TITLE: Record<AssistAction, string> = {
  polish: '潤飾後',
  opening: '開頭草稿',
  expand: '擴寫後',
  retone: '換過語氣',
}

export function ReviewToolbar() {
  const gate = useModelGate()
  const assist = useReviewAssist()
  const [draftLen, setDraftLen] = useState(0)
  const [tonesOpen, setTonesOpen] = useState(false)
  // 點了不能按的按鈕時要說的那句話（說明為什麼現在不行）
  const [hint, setHint] = useState('')

  // 跟著使用者打字更新字數，決定哪幾顆按鈕現在有意義
  useEffect(() => watchReviewDraft(setDraftLen), [])

  // 模型就緒才預熱：把 cold start 藏在他寫評論的那幾分鐘裡，按下按鈕時就不用等 create。
  // 掛載不會跑任何推論（工具列只是按鈕，沒有「打開」這個動作）。
  // 下載完成（done）等同就緒：這裡沒有「開始使用」那一步，下載完就直接把按鈕交出去
  const ready = gate.state === 'ready' || gate.state === 'done'
  useEffect(() => {
    if (!ready) return
    void assist.prewarm()
    return assist.release // 工具列被拆掉時收掉預熱的 session
  }, [ready, assist.prewarm, assist.release])

  const onAction = useCallback(
    (spec: ActionSpec) => {
      if (!spec.enabled(draftLen)) {
        setHint(spec.blockedHint)
        return
      }
      setHint('')
      setTonesOpen(false)
      void assist.run(spec.id)
    },
    [assist, draftLen],
  )

  const onTone = useCallback(
    (tone: ToneId) => {
      setTonesOpen(false)
      setHint('')
      void assist.run('retone', tone)
    },
    [assist],
  )

  const toggleTones = useCallback(() => {
    if (draftLen < MIN_DRAFT) {
      setHint('先寫幾句，才有東西可以換語氣。')
      return
    }
    setHint('')
    setTonesOpen((v) => !v)
  }, [draftLen])

  // 裝置 / 網站不支援：只留一行灰字說明，不擋著他寫評論
  if (gate.state === 'error') return <div className="rt-notice">{gate.error}</div>
  // 冷啟動校正中：先不佔位，避免按鈕閃一下又換樣子
  if (gate.state === 'unknown') return null

  if (!ready) {
    return (
      <div className="rt">
        {gate.state === 'downloading' ? (
          <div className="rt-notice">
            正在下載 AI 模型…{gate.downloadPct !== null ? ` ${gate.downloadPct}%` : ''}
            下載只會進行一次，之後就能直接使用。
          </div>
        ) : (
          <>
            <button type="button" className="rt-btn rt-btn--primary" onClick={() => void gate.accept()}>
              <EmojiIcon code="2728" />
              讓 AI 幫你寫這則評論
            </button>
            <div className="rt-notice">
              用 Chrome 內建 AI，全程在你的裝置上完成、不會上傳。第一次使用需要先下載模型。
            </div>
          </>
        )}
      </div>
    )
  }

  const streaming = assist.phase === 'streaming'

  return (
    <div className="rt">
      <div className="rt-row">
        {ACTIONS.map((spec) => (
          <button
            key={spec.id}
            type="button"
            className={`rt-btn${spec.enabled(draftLen) ? '' : ' rt-btn--off'}`}
            onClick={() => onAction(spec)}
            disabled={streaming}
            aria-disabled={!spec.enabled(draftLen)}
          >
            {spec.label}
          </button>
        ))}
        <button
          type="button"
          className={`rt-btn${draftLen >= MIN_DRAFT ? '' : ' rt-btn--off'}`}
          onClick={toggleTones}
          disabled={streaming}
          aria-expanded={tonesOpen}
        >
          換個語氣
        </button>
        <span className="rt-brand">
          <EmojiIcon code="2728" />
          本機 AI，內容不上傳
        </span>
      </div>

      {tonesOpen && (
        <div className="rt-tones">
          {TONES.map((t) => (
            <button key={t.id} type="button" className="rt-tone" onClick={() => onTone(t.id)}>
              <EmojiIcon code={t.code} />
              {t.label}
            </button>
          ))}
        </div>
      )}

      {hint && <div className="rt-notice">{hint}</div>}

      {assist.phase === 'error' && <div className="rt-error">{assist.error}</div>}

      {(streaming || assist.phase === 'done') && (
        <div className="rt-result">
          <div className="rt-result-head">
            {assist.action ? RESULT_TITLE[assist.action] : ''}
            {streaming && <span className="rt-dots">生成中…</span>}
          </div>
          {/* 串流中就顯示，讓他看得到進度；還沒吐第一塊時先留空行不跳版 */}
          <p className="rt-text">{assist.data ?? ''}</p>
          {assist.phase === 'done' && (
            <div className="rt-result-cta">
              <button type="button" className="rt-btn rt-btn--primary" onClick={assist.apply}>
                套用到評論
              </button>
              <button type="button" className="rt-btn" onClick={() => void assist.again()}>
                換一個
              </button>
              <button type="button" className="rt-btn rt-btn--ghost" onClick={assist.dismiss}>
                不用了
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
