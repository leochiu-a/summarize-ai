import { useState } from 'react'
import { useActiveTabHost } from '../hooks/useActiveTabHost'
import { useDisabledSites } from '../hooks/useDisabledSites'
import { findMatchingEntry, isPattern } from '../lib/disabledSites'

export function DisabledSitesPanel() {
  const activeHost = useActiveTabHost()
  const { hosts, setDisabled } = useDisabledSites()
  const [draft, setDraft] = useState('')

  // 目前網站可能被「完整 hostname」或「*.pattern」命中，兩種要分開處理：
  // pattern 命中時清單裡沒有這個 hostname 本身，切換開關沒東西可移除，只能導去下方清單編輯 pattern。
  const matchedEntry = activeHost && hosts ? findMatchingEntry(hosts, activeHost) : null
  const disabledByExactHost = matchedEntry !== null && matchedEntry === activeHost?.toLowerCase()
  const disabledByPattern = matchedEntry !== null && !disabledByExactHost
  const activeDisabled = matchedEntry !== null

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
            onClick={disabledByPattern ? undefined : () => void setDisabled(activeHost, !activeDisabled)}
            disabled={disabledByPattern}
            aria-pressed={activeDisabled}
          >
            <span className="toggle-copy">
              <span className="toggle-title">{activeHost}</span>
              <span className="toggle-hint">
                {disabledByPattern
                  ? `符合停用規則「${matchedEntry}」，到下方清單編輯該規則`
                  : activeDisabled
                    ? '小夥伴在這個網站已停用'
                    : '小夥伴在這個網站正常運作'}
              </span>
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
            {disabledByPattern
              ? `目前網站已被規則停用（${matchedEntry}）`
              : activeDisabled
                ? `目前網站已在清單裡（${activeHost}）`
                : `＋ 直接停用目前網站（${activeHost}）`}
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
            placeholder="輸入網域或規則，例如 *.sit.kkday.com"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="site-add-btn">
            新增
          </button>
        </form>
        <p className="hint">支援 * 萬用字元比對任意字元，例如 *.sit.kkday.com 會停用整個 sit 測試環境。</p>

        {hosts === null ? (
          <p className="hint">載入中⋯</p>
        ) : hosts.length === 0 ? (
          <p className="hint">目前沒有停用任何網站。</p>
        ) : (
          <ul className="site-list">
            {hosts.map((host) => (
              <li key={host} className="site-row">
                <span className="site-host-group">
                  <span className="site-host">{host}</span>
                  {isPattern(host) && <span className="site-badge">規則</span>}
                </span>
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
