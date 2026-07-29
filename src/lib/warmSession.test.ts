import { describe, expect, it, vi } from 'vitest'
import { createWarmSlot } from './warmSession'

// 假 session：記錄自己被 destroy 幾次
function fakeSession(key: string) {
  return { key, destroyed: 0, destroy() { this.destroyed += 1 } }
}

// 建一個可觀察的 slot：回傳 slot 與 create 呼叫紀錄
function setup() {
  const created: ReturnType<typeof fakeSession>[] = []
  const slot = createWarmSlot(async (key: string) => {
    const s = fakeSession(key)
    created.push(s)
    return s
  })
  return { slot, created }
}

describe('createWarmSlot', () => {
  it('同一個 key 只 create 一次，take 沿用預熱好的實例', async () => {
    const { slot, created } = setup()

    const warmed = await slot.warm('humorous')
    const taken = await slot.take('humorous')

    expect(created.length).toBe(1)
    expect(taken).toBe(warmed)
  })

  it('預熱還沒建好就 take：兩邊等到同一個 create（不會建兩份）', async () => {
    const { slot, created } = setup()

    const [a, b] = await Promise.all([slot.warm('serious'), slot.take('serious')])

    expect(created.length).toBe(1)
    expect(a).toBe(b)
  })

  it('key 變了（設定改過）→ 收掉舊的、建新的', async () => {
    const { slot, created } = setup()

    const old = await slot.warm('humorous')
    const next = await slot.take('cynical')

    expect(created.length).toBe(2)
    expect(next).not.toBe(old)
    await vi.waitFor(() => expect(old.destroyed).toBe(1))
  })

  it('release() 會 destroy 持有的 session，之後 take 重建', async () => {
    const { slot, created } = setup()

    const first = await slot.warm('humorous')
    slot.release()
    await vi.waitFor(() => expect(first.destroyed).toBe(1))

    const second = await slot.take('humorous')
    expect(created.length).toBe(2)
    expect(second).not.toBe(first)
  })

  it('還在建的時候 release()：建好後立刻收掉，不留在記憶體', async () => {
    const created: ReturnType<typeof fakeSession>[] = []
    let unblock!: () => void
    const gate = new Promise<void>((resolve) => (unblock = resolve))
    const slot = createWarmSlot(async (key: string) => {
      await gate
      const s = fakeSession(key)
      created.push(s)
      return s
    })

    void slot.warm('humorous').catch(() => {})
    slot.release()
    unblock()

    await vi.waitFor(() => expect(created[0]?.destroyed).toBe(1))
  })

  it('create 失敗後不會卡住：下一次 take 會重試', async () => {
    let attempt = 0
    const slot = createWarmSlot(async (key: string) => {
      attempt += 1
      if (attempt === 1) throw new Error('模型還沒好')
      return fakeSession(key)
    })

    await expect(slot.warm('humorous')).rejects.toThrow('模型還沒好')
    const retried = await slot.take('humorous')

    expect(attempt).toBe(2)
    expect(retried.key).toBe('humorous')
  })
})
