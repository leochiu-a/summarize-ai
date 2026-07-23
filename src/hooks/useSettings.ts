import { useCallback, useEffect, useState } from 'react'
import { getSettings, onSettingsChanged, saveSettings, type Settings } from '../lib/settings'

export interface UseSettings {
  settings: Settings | null // null = 載入中
  update: (patch: Partial<Settings>) => Promise<void>
}

// 載入設定並訂閱變更（popup 存檔後其他頁面即時同步）
export function useSettings(): UseSettings {
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    let alive = true
    void getSettings().then((s) => alive && setSettings(s))
    const unsub = onSettingsChanged((s) => alive && setSettings(s))
    return () => {
      alive = false
      unsub()
    }
  }, [])

  const update = useCallback(async (patch: Partial<Settings>) => {
    const next = await saveSettings(patch)
    setSettings(next)
  }, [])

  return { settings, update }
}
