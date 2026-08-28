import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DisabledSitesPanel } from './DisabledSitesPanel'
import { resetDisabledHostsForTest } from '../lib/disabledSites'

function stubActiveTab(url: string | null) {
  ;(globalThis as unknown as { chrome: typeof chrome }).chrome = {
    ...globalThis.chrome,
    tabs: {
      query: async () => (url ? [{ url }] : []),
    },
  } as unknown as typeof chrome
}

afterEach(() => {
  cleanup()
  resetDisabledHostsForTest()
  vi.unstubAllGlobals()
})

describe('DisabledSitesPanel', () => {
  it('讀不到目前分頁網址時顯示提示，不顯示切換開關', async () => {
    stubActiveTab(null)
    render(<DisabledSitesPanel />)

    await waitFor(() => expect(screen.getByText(/這個分頁讀不到網址/)).toBeTruthy())
    expect(screen.queryByRole('button', { name: /dev\.kkday\.com/ })).toBeNull()
  })

  it('讀到目前分頁 → 顯示 hostname 與「ON」狀態的切換開關，以及一鍵停用按鈕', async () => {
    stubActiveTab('https://dev.kkday.com/zh-tw/product/123')
    render(<DisabledSitesPanel />)

    await waitFor(() => expect(screen.getByText('dev.kkday.com')).toBeTruthy())
    expect(screen.getByText('ON')).toBeTruthy()
    expect(screen.getByText('小夥伴在這個網站正常運作')).toBeTruthy()
    expect(screen.getByRole('button', { name: /直接停用目前網站/ })).toBeTruthy()
  })

  it('點開關停用目前網站 → 狀態變 OFF，且出現在停用清單裡', async () => {
    stubActiveTab('https://dev.kkday.com/')
    render(<DisabledSitesPanel />)

    await waitFor(() => expect(screen.getByText('dev.kkday.com')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /小夥伴在這個網站正常運作/ }))

    await waitFor(() => expect(screen.getByText('OFF')).toBeTruthy())
    expect(screen.getByText('小夥伴在這個網站已停用')).toBeTruthy()
    // 清單裡也會多一列（hostname + 啟用按鈕）
    expect(screen.getAllByText('dev.kkday.com').length).toBeGreaterThan(1)
    expect(screen.getByRole('button', { name: '啟用' })).toBeTruthy()
    // 一鍵停用按鈕變成停用態，不能再按
    const quickAdd = screen.getByRole('button', { name: /目前網站已在清單裡/ }) as HTMLButtonElement
    expect(quickAdd.disabled).toBe(true)
  })

  it('直接點「一鍵停用目前網站」按鈕 → 不用開切換開關，直接進停用清單', async () => {
    stubActiveTab('https://dev.kkday.com/')
    render(<DisabledSitesPanel />)

    await waitFor(() => expect(screen.getByRole('button', { name: /直接停用目前網站/ })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /直接停用目前網站/ }))

    await waitFor(() => expect(screen.getByText('OFF')).toBeTruthy())
    expect(screen.getByRole('button', { name: '啟用' })).toBeTruthy()
  })

  it('手動輸入網域新增到停用清單', async () => {
    stubActiveTab(null)
    render(<DisabledSitesPanel />)

    await waitFor(() => expect(screen.getByText(/目前沒有停用任何網站/)).toBeTruthy())

    fireEvent.change(screen.getByPlaceholderText(/輸入網域/), { target: { value: 'stage.kkday.com' } })
    fireEvent.click(screen.getByRole('button', { name: '新增' }))

    await waitFor(() => expect(screen.getByText('stage.kkday.com')).toBeTruthy())
  })

  it('清單裡點「啟用」會移除該筆停用紀錄', async () => {
    stubActiveTab(null)
    render(<DisabledSitesPanel />)

    fireEvent.change(screen.getByPlaceholderText(/輸入網域/), { target: { value: 'stage.kkday.com' } })
    fireEvent.click(screen.getByRole('button', { name: '新增' }))
    await waitFor(() => expect(screen.getByText('stage.kkday.com')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: '啟用' }))
    await waitFor(() => expect(screen.getByText(/目前沒有停用任何網站/)).toBeTruthy())
  })

  it('可以新增 * 萬用字元 pattern，清單裡標示「規則」badge', async () => {
    stubActiveTab(null)
    render(<DisabledSitesPanel />)

    fireEvent.change(screen.getByPlaceholderText(/輸入網域/), { target: { value: '*.sit.kkday.com' } })
    fireEvent.click(screen.getByRole('button', { name: '新增' }))

    await waitFor(() => expect(screen.getByText('*.sit.kkday.com')).toBeTruthy())
    expect(screen.getByText('規則')).toBeTruthy()
  })

  it('目前網站被既有的 pattern 命中（非完整 hostname）→ 開關與一鍵按鈕都不能按，導去清單編輯規則', async () => {
    stubActiveTab('https://dev.sit.kkday.com/')
    render(<DisabledSitesPanel />)

    fireEvent.change(screen.getByPlaceholderText(/輸入網域/), { target: { value: '*.sit.kkday.com' } })
    fireEvent.click(screen.getByRole('button', { name: '新增' }))

    await waitFor(() => expect(screen.getByText(/符合停用規則/)).toBeTruthy())
    expect(screen.getByText('OFF')).toBeTruthy()

    const toggle = screen.getByRole('button', { name: /符合停用規則/ }) as HTMLButtonElement
    expect(toggle.disabled).toBe(true)

    const quickAdd = screen.getByRole('button', { name: /目前網站已被規則停用/ }) as HTMLButtonElement
    expect(quickAdd.disabled).toBe(true)
  })
})
