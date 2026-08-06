import { afterEach, describe, expect, it } from 'vitest'
import {
  getDisabledHosts,
  isHostDisabled,
  resetDisabledHostsForTest,
  setHostDisabled,
} from './disabledSites'

afterEach(() => {
  resetDisabledHostsForTest()
})

describe('預設值', () => {
  it('未設定時清單是空的', async () => {
    expect(await getDisabledHosts()).toEqual([])
  })

  it('未停用的 host 判斷為 false', async () => {
    expect(await isHostDisabled('dev.kkday.com')).toBe(false)
  })
})

describe('setHostDisabled', () => {
  it('停用後會出現在清單裡，isHostDisabled 回 true', async () => {
    const hosts = await setHostDisabled('dev.kkday.com', true)
    expect(hosts).toEqual(['dev.kkday.com'])
    expect(await isHostDisabled('dev.kkday.com')).toBe(true)
  })

  it('大小寫不敏感：存的是正規化後的小寫 hostname', async () => {
    await setHostDisabled('Dev.KKday.com', true)
    expect(await getDisabledHosts()).toEqual(['dev.kkday.com'])
    expect(await isHostDisabled('DEV.kkday.COM')).toBe(true)
  })

  it('重複停用同一個 host 不會出現兩次', async () => {
    await setHostDisabled('dev.kkday.com', true)
    const hosts = await setHostDisabled('dev.kkday.com', true)
    expect(hosts).toEqual(['dev.kkday.com'])
  })

  it('取消停用會從清單移除，其他 host 不受影響', async () => {
    await setHostDisabled('dev.kkday.com', true)
    await setHostDisabled('stage.kkday.com', true)
    const hosts = await setHostDisabled('dev.kkday.com', false)
    expect(hosts).toEqual(['stage.kkday.com'])
    expect(await isHostDisabled('dev.kkday.com')).toBe(false)
  })

  it('只停用完整 hostname，不影響其他子網域', async () => {
    await setHostDisabled('dev.kkday.com', true)
    expect(await isHostDisabled('kkday.com')).toBe(false)
    expect(await isHostDisabled('www.kkday.com')).toBe(false)
  })
})
