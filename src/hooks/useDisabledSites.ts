import { useCallback, useEffect, useState } from 'react'
import { getDisabledHosts, onDisabledHostsChanged, setHostDisabled } from '../lib/disabledSites'

export interface UseDisabledSites {
  hosts: string[] | null // null = 載入中
  setDisabled: (host: string, disabled: boolean) => Promise<void>
}

// 載入停用清單並訂閱變更（跟 useSettings 同一套模式）
export function useDisabledSites(): UseDisabledSites {
  const [hosts, setHosts] = useState<string[] | null>(null)

  useEffect(() => {
    let alive = true
    void getDisabledHosts().then((h) => alive && setHosts(h))
    const unsub = onDisabledHostsChanged((h) => alive && setHosts(h))
    return () => {
      alive = false
      unsub()
    }
  }, [])

  const setDisabled = useCallback(async (host: string, disabled: boolean) => {
    const next = await setHostDisabled(host, disabled)
    setHosts(next)
  }, [])

  return { hosts, setDisabled }
}
