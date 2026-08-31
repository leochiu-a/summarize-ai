import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReviewContext } from './reviewPage'
import { buildPrompt, generateAssist, releaseReviewAssist } from './reviewAssist'

// 依序吐出 chunks 後結束的串流
async function* chunkStream(chunks: string[]): AsyncIterable<string> {
  for (const c of chunks) yield c
}

const EMPTY_CONTEXT: ReviewContext = { productName: '', rating: null, travellerType: '', title: '' }

// Rewriter stub：availability 與 create 的行為都可控，用來模擬各種「不能走」的情況
function stubRewriter(opts: {
  availability?: Availability
  createThrows?: boolean
  chunks?: string[]
}) {
  const calls = { availability: 0, create: 0, destroy: 0 }
  vi.stubGlobal('Rewriter', {
    availability: async () => {
      calls.availability += 1
      return opts.availability ?? 'available'
    },
    create: async () => {
      calls.create += 1
      if (opts.createThrows) throw new Error('boom')
      return {
        rewriteStreaming: () => chunkStream(opts.chunks ?? ['Rewriter 的結果']),
        destroy: () => {
          calls.destroy += 1
        },
      }
    },
  })
  return calls
}

// LanguageModel stub：baseline 只建一次、每次執行 clone 一份（對齊 warm slot 的用法），
// 並記下 clone 拿到的 prompt。
function stubLanguageModel(chunks: string[] = ['Prompt API 的結果']) {
  const calls = { create: 0, clone: 0, destroy: 0, prompts: [] as string[] }
  const session = {
    promptStreaming: (p: string) => {
      calls.prompts.push(p)
      return chunkStream(chunks)
    },
    clone: async () => {
      calls.clone += 1
      return session
    },
    destroy: () => {
      calls.destroy += 1
    },
  }
  vi.stubGlobal('LanguageModel', {
    create: async () => {
      calls.create += 1
      return session
    },
  })
  return calls
}

function input(overrides: Partial<Parameters<typeof buildPrompt>[0]> = {}) {
  return {
    action: 'polish' as const,
    draft: '原文',
    context: EMPTY_CONTEXT,
    tone: 'gentle' as const,
    ...overrides,
  }
}

afterEach(() => {
  // warm slot 是模組級狀態，不收掉的話下一個測試會沿用上一個 stub 建出來的 session
  releaseReviewAssist()
  vi.unstubAllGlobals()
})

describe('buildPrompt：四個動作各自的指示', () => {
  it('polish 帶原文、語氣，不談表單資訊', () => {
    const p = buildPrompt(input({ tone: 'cynical' }))
    expect(p).toContain('潤飾得更通順')
    expect(p).toContain('使用者原文：\n原文')
    expect(p).toContain('淡定直白') // cynical 的語氣描述
  })

  it('opening 只餵使用者自己填過的欄位，沒填的一個字都不提', () => {
    const p = buildPrompt(
      input({
        action: 'opening',
        draft: '',
        context: { productName: 'HARUKA 車票', rating: 4, travellerType: '', title: '' },
      }),
    )
    expect(p).toContain('商品：HARUKA 車票')
    expect(p).toContain('4 顆星')
    expect(p).not.toContain('同行對象') // 沒選就不要出現，免得模型自己補
    expect(p).toContain('不要描寫任何你不知道的體驗細節')
  })

  it('expand 明講不准新增事實', () => {
    expect(buildPrompt(input({ action: 'expand' }))).toContain('嚴禁新增他沒提過的事實')
  })

  it('retone 只換說法、不動內容', () => {
    const p = buildPrompt(input({ action: 'retone', tone: 'literary' }))
    expect(p).toContain('內容、事實、評價一字不改')
    expect(p).toContain('感性、帶點畫面感')
  })

  it('有字數上限就把上限講給模型聽', () => {
    expect(buildPrompt(input({ limit: 900 }))).toContain('不要超過 900 字')
    expect(buildPrompt(input({ limit: null }))).not.toContain('不要超過')
  })

  it('rephrase 追加「換個說法」，但不放寬真實性底線', () => {
    const p = buildPrompt(input({ rephrase: true }))
    expect(p).toContain('請換不同的句構與用詞重新寫一次')
    expect(p).toContain('不能杜撰或改變原意')
  })
})

describe('generateAssist：polish 優先走 Rewriter', () => {
  it('串流結果與 onChunk 累積內容都正確，session 有收掉', async () => {
    const rewriter = stubRewriter({ chunks: ['潤飾後：', '這趟體驗很棒'] })
    const lm = stubLanguageModel()

    const seen: string[] = []
    const result = await generateAssist(input(), (acc) => seen.push(acc))

    expect(result).toBe('潤飾後：這趟體驗很棒')
    expect(seen).toEqual(['潤飾後：', '潤飾後：這趟體驗很棒']) // 累積值，不是 delta
    expect(rewriter.create).toBe(1)
    expect(rewriter.destroy).toBe(1)
    expect(lm.create).toBe(0) // 沒有多跑一次 fallback
  })

  it('rephrase 走 per-call context', async () => {
    const contexts: (string | undefined)[] = []
    vi.stubGlobal('Rewriter', {
      availability: async () => 'available' as Availability,
      create: async () => ({
        rewriteStreaming: (_input: string, opts?: { context?: string }) => {
          contexts.push(opts?.context)
          return chunkStream(['換一版'])
        },
        destroy: () => {},
      }),
    })

    await generateAssist(input())
    await generateAssist(input({ rephrase: true }))

    expect(contexts[0]).toBeUndefined() // 一般潤飾不加料
    expect(contexts[1]).toContain('請換不同的句構與用詞重新寫一次')
  })

  it('Rewriter 串到一半失敗 → 直接拋錯，不會用 Prompt API 重跑蓋掉畫面', async () => {
    vi.stubGlobal('Rewriter', {
      availability: async () => 'available' as Availability,
      create: async () => ({
        rewriteStreaming: async function* () {
          yield '前半段'
          throw new Error('串流中斷')
        },
        destroy: () => {},
      }),
    })
    const lm = stubLanguageModel()

    await expect(generateAssist(input())).rejects.toThrow('串流中斷')
    expect(lm.create).toBe(0)
  })
})

describe('generateAssist：其餘動作與 fallback 走 Prompt API', () => {
  it('Rewriter 不存在（未進穩定版的一般使用者）→ polish 也用 LanguageModel', async () => {
    const lm = stubLanguageModel(['退回', '後的結果'])

    await expect(generateAssist(input())).resolves.toBe('退回後的結果')
    expect(lm.create).toBe(1)
  })

  it('Rewriter 可用也不會拿去做 opening / expand / retone', async () => {
    const rewriter = stubRewriter({})
    const lm = stubLanguageModel()

    await generateAssist(input({ action: 'opening', draft: '' }))
    await generateAssist(input({ action: 'expand' }))
    await generateAssist(input({ action: 'retone' }))

    expect(rewriter.create).toBe(0)
    expect(lm.prompts).toHaveLength(3)
  })

  it('baseline 只建一次、每次執行 clone 一份用完就收', async () => {
    const lm = stubLanguageModel()

    await generateAssist(input({ action: 'expand' }))
    await generateAssist(input({ action: 'retone' }))

    expect(lm.create).toBe(1) // baseline 沿用預熱那一份
    expect(lm.clone).toBe(2)
    expect(lm.destroy).toBe(2) // 收的是 clone，baseline 留著
  })

  it('兩個 API 都沒有 → 拋出可讀的錯誤', async () => {
    await expect(generateAssist(input({ action: 'expand' }))).rejects.toThrow(
      /不支援內建 Prompt API/,
    )
  })
})
