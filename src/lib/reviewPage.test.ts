import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getReviewTextarea,
  isReviewPage,
  readReviewContext,
  readReviewDraft,
  reviewDraftLimit,
  watchReviewDraft,
  writeReviewDraft,
} from './reviewPage'

// 塞一個評論輸入框（placeholder 帶「體驗」，模擬 KKday 評論頁）
function seedTextarea(placeholder = '你覺得這次體驗如何呢？請告訴我們'): HTMLTextAreaElement {
  const el = document.createElement('textarea')
  el.placeholder = placeholder
  document.body.appendChild(el)
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
  window.history.replaceState({}, '', '/')
})

describe('isReviewPage', () => {
  it('評論頁路徑（含 locale 前綴）為真', () => {
    window.history.replaceState({}, '', '/zh-tw/order/comment/25KK268720222')
    expect(isReviewPage()).toBe(true)
  })

  it('非評論頁為假', () => {
    window.history.replaceState({}, '', '/zh-tw/product/138477')
    expect(isReviewPage()).toBe(false)
    window.history.replaceState({}, '', '/')
    expect(isReviewPage()).toBe(false)
  })
})

describe('getReviewTextarea', () => {
  it('優先抓 placeholder 帶「體驗/想法」字樣的 textarea', () => {
    const other = document.createElement('textarea')
    other.placeholder = '其他無關輸入'
    document.body.appendChild(other)
    const target = seedTextarea()
    expect(getReviewTextarea()).toBe(target)
  })

  it('沒有符合 placeholder 時退回第一個 textarea', () => {
    const first = document.createElement('textarea')
    first.placeholder = '隨便'
    document.body.appendChild(first)
    expect(getReviewTextarea()).toBe(first)
  })
})

describe('readReviewDraft', () => {
  it('回傳去頭尾空白的內容；沒有框回空字串', () => {
    expect(readReviewDraft()).toBe('')
    const el = seedTextarea()
    el.value = '  很棒的體驗  '
    expect(readReviewDraft()).toBe('很棒的體驗')
  })
})

describe('writeReviewDraft', () => {
  it('寫回文字並派發 input/change 事件（讓框架雙向綁定同步）', () => {
    const el = seedTextarea()
    const events: string[] = []
    el.addEventListener('input', () => events.push('input'))
    el.addEventListener('change', () => events.push('change'))

    const ok = writeReviewDraft('潤飾後的內容')
    expect(ok).toBe(true)
    expect(el.value).toBe('潤飾後的內容')
    expect(events).toContain('input')
    expect(events).toContain('change')
  })

  it('沒有框時回 false', () => {
    expect(writeReviewDraft('x')).toBe(false)
  })
})

describe('watchReviewDraft', () => {
  it('掛上即回報一次目前長度，之後 input 事件更新長度', () => {
    const el = seedTextarea()
    el.value = '先寫了三個字' // 6 字
    const lengths: number[] = []
    const stop = watchReviewDraft((len) => lengths.push(len))

    // 立即回報一次
    expect(lengths[0]).toBe(6)

    // 使用者打字
    el.value = '先寫了三個字再多一點'
    el.dispatchEvent(new Event('input', { bubbles: true }))
    expect(lengths.at(-1)).toBe('先寫了三個字再多一點'.trim().length)

    stop()
  })

  it('解除後不再回報', () => {
    const el = seedTextarea()
    const lengths: number[] = []
    const stop = watchReviewDraft((len) => lengths.push(len))
    stop()
    const before = lengths.length

    el.value = '新內容'
    el.dispatchEvent(new Event('input', { bubbles: true }))
    expect(lengths.length).toBe(before) // 沒有新增
  })

  it('textarea 晚出現（SPA render）也能等到並掛上', async () => {
    vi.useFakeTimers()
    const lengths: number[] = []
    const stop = watchReviewDraft((len) => lengths.push(len))
    expect(lengths.length).toBe(0) // 還沒有框

    const el = seedTextarea()
    el.value = '晚點才出現'
    // MutationObserver 是 microtask，等它跑
    await Promise.resolve()
    await Promise.resolve()
    expect(lengths.at(-1)).toBe('晚點才出現'.length)

    stop()
    vi.useRealTimers()
  })
})

describe('reviewDraftLimit', () => {
  it('讀輸入框自己的 maxlength；沒設回 null', () => {
    const el = seedTextarea()
    expect(reviewDraftLimit()).toBeNull()
    el.maxLength = 900
    expect(reviewDraftLimit()).toBe(900)
  })
})

describe('writeReviewDraft 的字數上限', () => {
  it('超過 maxlength 的部分先截掉（程式寫入不受 maxlength 限制，留著只會在送出時才爆）', () => {
    const el = seedTextarea()
    el.maxLength = 10
    writeReviewDraft('一'.repeat(30))
    expect(el.value).toHaveLength(10)
  })
})

describe('readReviewContext', () => {
  // 對齊實機評論頁：商品名在連到 /product/<id> 的標題裡，其餘走表單欄位 name
  function seedForm(): void {
    document.body.innerHTML = `
      <a href="https://www.kkday.com/zh-tw/product/18940"><div><h2> HARUKA 車票 </h2></div></a>
      <ul name="recScore">
        <li><i class="fa fa-star text-primary"></i></li>
        <li><i class="fa fa-star text-primary"></i></li>
        <li><i class="fa fa-star text-primary"></i></li>
        <li><i class="fa fa-star-o"></i></li>
        <li><i class="fa fa-star-o"></i></li>
      </ul>
      <input name="travellerType" type="radio" value="情侶" />
      <input name="travellerType" type="radio" value="家人" checked />
      <input name="recTitle" value="很順的機場交通" />
    `
  }

  it('讀得到商品名、星等、旅伴類別與標題', () => {
    seedForm()
    expect(readReviewContext()).toEqual({
      productName: 'HARUKA 車票',
      rating: 3, // 實心星的顆數
      travellerType: '家人',
      title: '很順的機場交通',
    })
  })

  it('星等優先信元件自己寫的 data-validate-value（實心星是後備）', () => {
    seedForm()
    document.querySelector('[name="recScore"]')!.setAttribute('data-validate-value', '5')
    expect(readReviewContext().rating).toBe(5)
  })

  it('什麼都沒填時回空值，不亂猜', () => {
    expect(readReviewContext()).toEqual({
      productName: '',
      rating: null,
      travellerType: '',
      title: '',
    })
  })
})
