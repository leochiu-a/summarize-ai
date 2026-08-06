import { afterEach, describe, expect, it } from 'vitest'
import {
  findMatchingEntry,
  getDisabledHosts,
  hostMatchesPattern,
  isHostDisabled,
  isPattern,
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

describe('萬用字元 pattern', () => {
  it('isPattern 只認含 * 的 entry', () => {
    expect(isPattern('*.sit.kkday.com')).toBe(true)
    expect(isPattern('dev.kkday.com')).toBe(false)
  })

  it('hostMatchesPattern：*.sit.kkday.com 吃掉任何子網域，但不含自己', () => {
    expect(hostMatchesPattern('dev.sit.kkday.com', '*.sit.kkday.com')).toBe(true)
    expect(hostMatchesPattern('member.sit.kkday.com', '*.sit.kkday.com')).toBe(true)
    expect(hostMatchesPattern('sit.kkday.com', '*.sit.kkday.com')).toBe(false)
    expect(hostMatchesPattern('kkday.com', '*.sit.kkday.com')).toBe(false)
  })

  it('沒有 * 的 entry 只做完整字串相等比對', () => {
    expect(hostMatchesPattern('dev.kkday.com', 'dev.kkday.com')).toBe(true)
    expect(hostMatchesPattern('dev.kkday.com.evil.com', 'dev.kkday.com')).toBe(false)
  })

  it('setHostDisabled 存 pattern 後，isHostDisabled 對比對到的 host 回 true', async () => {
    await setHostDisabled('*.sit.kkday.com', true)
    expect(await isHostDisabled('dev.sit.kkday.com')).toBe(true)
    expect(await isHostDisabled('autotest.sit.kkday.com')).toBe(true)
    expect(await isHostDisabled('kkday.com')).toBe(false)
  })

  it('findMatchingEntry 回傳實際命中的那筆 entry（pattern 或完整 hostname）', async () => {
    await setHostDisabled('dev.kkday.com', true)
    await setHostDisabled('*.sit.kkday.com', true)
    const hosts = await getDisabledHosts()
    expect(findMatchingEntry(hosts, 'dev.kkday.com')).toBe('dev.kkday.com')
    expect(findMatchingEntry(hosts, 'member.sit.kkday.com')).toBe('*.sit.kkday.com')
    expect(findMatchingEntry(hosts, 'kkday.com')).toBeNull()
  })
})
