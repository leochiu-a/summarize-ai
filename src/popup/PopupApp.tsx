import { EmojiIcon } from '../components/EmojiIcon'
import { SUMMARY_TYPES, TONES } from '../lib/settings'
import { useSettings } from '../hooks/useSettings'

function assetUrl(path: string): string {
  return typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL(path) : path
}

const spriteUrl = assetUrl('assets/sprite.png')

export function PopupApp() {
  const { settings, update } = useSettings()

  if (!settings) {
    return <div className="loading">載入中⋯</div>
  }

  return (
    <main className="panel">
      <header className="head">
        <div className="portrait" style={{ backgroundImage: `url("${spriteUrl}")` }} aria-hidden="true" />
        <div className="head-text">
          <p className="kicker">BUDDY · CONTROL<span className="caret" /></p>
          <h1>小夥伴設定</h1>
        </div>
      </header>

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

      <section className="section" style={{ '--i': 2 } as React.CSSProperties}>
        <div className="section-label">
          <span className="num">03</span>
          <span className="name">自動摘要</span>
        </div>
        <button
          type="button"
          className={settings.autoRun ? 'toggle-row on' : 'toggle-row'}
          onClick={() => void update({ autoRun: !settings.autoRun })}
          aria-pressed={settings.autoRun}
        >
          <span className="toggle-copy">
            <span className="toggle-title">每個頁面自動摘要</span>
            <span className="toggle-hint">一打開網頁小夥伴就先幫你讀</span>
          </span>
          <span className="switch">
            <span className="switch-state">{settings.autoRun ? 'ON' : 'OFF'}</span>
            <span className="knob" />
          </span>
        </button>
      </section>

      <footer className="foot">
        <span className="blink">▚</span> 設定會立即套用到下一次摘要
      </footer>
    </main>
  )
}
