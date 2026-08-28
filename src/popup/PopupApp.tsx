import { useState } from 'react'
import { DisabledSitesPanel } from './DisabledSitesPanel'
import { SettingsPanel } from './SettingsPanel'
import { useSettings } from '../hooks/useSettings'

function assetUrl(path: string): string {
  return typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL(path) : path
}

const spriteUrl = assetUrl('assets/sprite.png')

type View = 'settings' | 'sites'

export function PopupApp() {
  const settingsState = useSettings()
  const [view, setView] = useState<View>('settings')

  return (
    <main className="panel">
      <header className="head">
        <div className="portrait" style={{ backgroundImage: `url("${spriteUrl}")` }} aria-hidden="true" />
        <div className="head-text">
          <p className="kicker">BUDDY · CONTROL<span className="caret" /></p>
          <h1>小夥伴設定</h1>
        </div>
      </header>

      <nav className="tabbar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'settings'}
          className={view === 'settings' ? 'tab on' : 'tab'}
          onClick={() => setView('settings')}
        >
          設定
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'sites'}
          className={view === 'sites' ? 'tab on' : 'tab'}
          onClick={() => setView('sites')}
        >
          停用清單
        </button>
      </nav>

      {view === 'settings' ? <SettingsPanel {...settingsState} /> : <DisabledSitesPanel />}
    </main>
  )
}
