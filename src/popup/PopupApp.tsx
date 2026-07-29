import { EmojiIcon } from '../components/EmojiIcon'
import { pageKeyLabel } from '../lib/pageScope'
import { SUMMARY_TYPES, TONES } from '../lib/settings'
import { useCurrentTabPage } from '../hooks/useCurrentTabPage'
import { useSettings } from '../hooks/useSettings'

function assetUrl(path: string): string {
  return typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL(path) : path
}

const spriteUrl = assetUrl('assets/sprite.png')

export function PopupApp() {
  const { settings, update } = useSettings()
  const page = useCurrentTabPage()

  if (!settings) {
    return <div className="loading">載入中⋯</div>
  }

  const { enabled, disabledPages } = settings
  // 當前分頁是不是已經在停用清單裡（拿不到網址時沒有可切換的目標）
  const thisPageOff = page.key !== null && disabledPages.includes(page.key)

  const toggleThisPage = () => {
    if (page.key === null) return
    void update({
      disabledPages: thisPageOff
        ? disabledPages.filter((p) => p !== page.key)
        : [...disabledPages, page.key],
    })
  }

  const removeDisabled = (key: string) => {
    void update({ disabledPages: disabledPages.filter((p) => p !== key) })
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
          <span className="name">小夥伴</span>
        </div>
        <button
          type="button"
          className={enabled ? 'toggle-row on' : 'toggle-row'}
          onClick={() => void update({ enabled: !enabled })}
          aria-pressed={enabled}
        >
          <span className="toggle-copy">
            <span className="toggle-title">{enabled ? '正在待命' : '已休息'}</span>
            <span className="toggle-hint">
              {enabled ? '在 kkday 頁面出現並提供 AI 功能' : '所有頁面都不出現、也不跑 AI'}
            </span>
          </span>
          <span className="switch" aria-hidden="true">
            <span className="switch-state">{enabled ? 'ON' : 'OFF'}</span>
            <span className="knob" />
          </span>
        </button>
      </section>

      {/* 總開關關閉時，底下的細項設定沒有作用：inert 一次擋掉點擊與鍵盤 focus，CSS 再壓暗 */}
      <div className="settings-body" inert={!enabled}>
        <section className="section" style={{ '--i': 1 } as React.CSSProperties}>
          <div className="section-label">
            <span className="num">02</span>
            <span className="name">這個頁面</span>
          </div>

          {page.loading ? (
            <p className="hint">讀取當前分頁⋯</p>
          ) : page.key === null ? (
            <p className="hint">這個分頁不是 kkday 頁面，沒有可停用的對象。</p>
          ) : (
            <>
              <p className="page-path" title={page.key}>
                {pageKeyLabel(page.key)}
              </p>
              <button
                type="button"
                className={thisPageOff ? 'page-btn on' : 'page-btn'}
                onClick={toggleThisPage}
              >
                {thisPageOff ? '↺ 在這頁重新啟用' : '✕ 在這頁停用'}
              </button>
            </>
          )}

          {disabledPages.length > 0 && (
            <ul className="page-list">
              {disabledPages.map((key) => (
                <li key={key} className="page-item">
                  <span className="page-item-path" title={key}>
                    {pageKeyLabel(key)}
                  </span>
                  <button
                    type="button"
                    className="page-item-del"
                    onClick={() => removeDisabled(key)}
                    aria-label={`把 ${pageKeyLabel(key)} 移出停用清單`}
                    title="移出停用清單"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* 沒有可停用的對象、清單也空的時候就不用再補一句廢話 */}
          {disabledPages.length > 0 ? (
            <p className="hint">已停用 {disabledPages.length} 個頁面（不分語系）</p>
          ) : (
            page.key !== null && <p className="hint">停用只影響這一個頁面，其他頁面照常運作</p>
          )}
        </section>

        <section className="section" style={{ '--i': 2 } as React.CSSProperties}>
          <div className="section-label">
            <span className="num">03</span>
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

        <section className="section" style={{ '--i': 3 } as React.CSSProperties}>
          <div className="section-label">
            <span className="num">04</span>
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
      </div>

      <footer className="foot">
        <span className="blink">▚</span>{' '}
        {enabled ? '設定會立即套用到已開啟的分頁' : '小夥伴已關閉，開啟後立即恢復'}
      </footer>
    </main>
  )
}
