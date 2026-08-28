import { EmojiIcon } from '../components/EmojiIcon'
import type { UseSettings } from '../hooks/useSettings'
import { SUMMARY_TYPES, TONES } from '../lib/settings'

export function SettingsPanel({ settings, update }: UseSettings) {
  if (!settings) {
    return <div className="loading">載入中⋯</div>
  }

  return (
    <>
      <section className="section" style={{ '--i': 0 } as React.CSSProperties}>
        <div className="section-label">
          <span className="num">01</span>
          <span className="name">語氣</span>
        </div>
        <div className="tone-grid">
          {TONES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={settings.tone === t.id ? 'tone on' : 'tone'}
              onClick={() => void update({ tone: t.id })}
              aria-pressed={settings.tone === t.id}
            >
              <span className="tone-emoji">
                <EmojiIcon code={t.code} label={t.label} />
              </span>
              <span className="tone-label">{t.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="section" style={{ '--i': 1 } as React.CSSProperties}>
        <div className="section-label">
          <span className="num">02</span>
          <span className="name">摘要類型</span>
        </div>
        <div className="segments">
          {SUMMARY_TYPES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={settings.summaryType === s.id ? 'seg on' : 'seg'}
              onClick={() => void update({ summaryType: s.id })}
              aria-pressed={settings.summaryType === s.id}
              title={s.hint}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="hint">{SUMMARY_TYPES.find((s) => s.id === settings.summaryType)?.hint}</p>
      </section>

      <footer className="foot">
        <span className="blink">▚</span> 設定會立即套用到下一次摘要
      </footer>
    </>
  )
}
