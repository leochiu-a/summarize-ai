import { useState } from 'react'
import { useActiveTabHost } from '../hooks/useActiveTabHost'
import { useDisabledSites } from '../hooks/useDisabledSites'

export function DisabledSitesPanel() {
  const activeHost = useActiveTabHost()
  const { hosts, setDisabled } = useDisabledSites()
  const [draft, setDraft] = useState('')

  const activeDisabled = activeHost ? (hosts?.includes(activeHost.toLowerCase()) ?? false) : false

  function addDraft() {
    const host = draft.trim().toLowerCase()
    if (!host) return
    void setDisabled(host, true)
    setDraft('')
  }

  return (
    <>
      <section className="section" style={{ '--i': 0 } as React.CSSProperties}>
        <div className="section-label">
          <span className="num">01</span>
          <span className="name">目前網站</span>
        </div>
        {activeHost === undefined ? (
          <p className="hint">讀取目前網站⋯</p>
        ) : activeHost === null ? (
          <p className="hint">這個分頁讀不到網址，換一個 kkday.com 的頁面再開 popup 試試。</p>
        ) : (
          <button
            type="button"
            className={activeDisabled ? 'toggle-row on' : 'toggle-row'}
            onClick={() => void setDisabled(activeHost, !activeDisabled)}
            aria-pressed={activeDisabled}
          >
            <span className="toggle-copy">
              <span className="toggle-title">{activeHost}</span>
              <span className="toggle-hint">{activeDisabled ? '小夥伴在這個網站已停用' : '小夥伴在這個網站正常運作'}</span>
            </span>
            <span className="switch">
              <span className="switch-state">{activeDisabled ? 'OFF' : 'ON'}</span>
              <span className="knob" />
            </span>
          </button>
        )}
      </section>

      <section className="section" style={{ '--i': 1 } as React.CSSProperties}>
        <div className="section-label">
          <span className="num">02</span>
          <span className="name">停用清單{hosts && hosts.length > 0 ? `（${hosts.length}）` : ''}</span>
        </div>

        {activeHost && (
          <button
            type="button"
            className="site-quickadd"
            onClick={() => void setDisabled(activeHost, true)}
            disabled={activeDisabled}
          >
            {activeDisabled ? `目前網站已在清單裡（${activeHost}）` : `＋ 直接停用目前網站（${activeHost}）`}
          </button>
        )}

        <form
          className="site-add"
          onSubmit={(e) => {
            e.preventDefault()
            addDraft()
          }}
        >
          <input
            className="site-input"
            type="text"
            inputMode="url"
            placeholder="輸入網域，例如 dev.kkday.com"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="site-add-btn">
            新增
          </button>
        </form>

        {hosts === null ? (
          <p className="hint">載入中⋯</p>
        ) : hosts.length === 0 ? (
          <p className="hint">目前沒有停用任何網站。</p>
        ) : (
          <ul className="site-list">
            {hosts.map((host) => (
              <li key={host} className="site-row">
                <span className="site-host">{host}</span>
                <button type="button" className="site-remove" onClick={() => void setDisabled(host, false)}>
                  啟用
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="foot">
        <span className="blink">▚</span> 停用的網站不會載入任何 AI 功能，重新整理頁面即可套用
      </footer>
    </>
  )
}
