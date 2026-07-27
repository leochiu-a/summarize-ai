import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateRewrite } from './reviewRewrite'

// 依序吐出 chunks 後結束的串流
async function* chunkStream(chunks: string[]): AsyncIterable<string> {
  for (const c of chunks) yield c
}

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

// LanguageModel stub：記下拿到的 prompt，方便驗證 fallback 有把指示帶進去
function stubLanguageModel(chunks: string[] = ['Prompt API 的結果']) {
  const calls = { create: 0, destroy: 0, prompts: [] as string[] }
  vi.stubGlobal('LanguageModel', {
    create: async () => {
      calls.create += 1
      return {
        promptStreaming: (p: string) => {
          calls.prompts.push(p)
          return chunkStream(chunks)
        },
        destroy: () => {
          calls.destroy += 1
        },
      }
    },
  })
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('generateRewrite：Rewriter 可用時走 Rewriter', () => {
  it('串流結果與 onChunk 累積內容都正確，session 有收掉', async () => {
    const rewriter = stubRewriter({ chunks: ['潤飾後：', '這趟體驗很棒'] })
    const lm = stubLanguageModel()

    const seen: string[] = []
    const result = await generateRewrite('原文', 'gentle', (acc) => seen.push(acc))

    expect(result).toBe('潤飾後：這趟體驗很棒')
    expect(seen).toEqual(['潤飾後：', '潤飾後：這趟體驗很棒']) // 累積值，不是 delta
    expect(rewriter.create).toBe(1)
    expect(rewriter.destroy).toBe(1)
    expect(lm.create).toBe(0) // 沒有多跑一次 fallback
  })
})

describe('generateRewrite：退回 Prompt API', () => {
  it('Rewriter 不存在（未進穩定版的一般使用者）→ 用 LanguageModel', async () => {
    const lm = stubLanguageModel(['退回', '後的結果'])

    const result = await generateRewrite('原文', 'gentle')

    expect(result).toBe('退回後的結果')
    expect(lm.create).toBe(1)
    expect(lm.destroy).toBe(1)
  })

  it('Rewriter 存在但 availability 是 unavailable → 用 LanguageModel，不建 Rewriter session', async () => {
    const rewriter = stubRewriter({ availability: 'unavailable' })
    const lm = stubLanguageModel()

    await expect(generateRewrite('原文', 'gentle')).resolves.toBe('Prompt API 的結果')
    expect(rewriter.create).toBe(0)
    expect(lm.create).toBe(1)
  })

  it('Rewriter.create 失敗 → 用 LanguageModel', async () => {
    stubRewriter({ createThrows: true })
    const lm = stubLanguageModel()

    await expect(generateRewrite('原文', 'gentle')).resolves.toBe('Prompt API 的結果')
    expect(lm.create).toBe(1)
  })

  it('fallback 的 prompt 有帶原文、語氣與「只輸出本文」的限制', async () => {
    const lm = stubLanguageModel()

    await generateRewrite('這趟體驗蠻好的', 'cynical')

    const prompt = lm.prompts[0]
    expect(prompt).toContain('這趟體驗蠻好的')
    expect(prompt).toContain('淡定直白') // cynical 的語氣描述
    expect(prompt).toContain('不要新增任何他沒提到的細節')
    expect(prompt).toContain('只輸出潤飾後的評論本文')
  })
})

describe('generateRewrite：rephrase（重新潤飾）', () => {
  it('Rewriter 路徑把重寫要求放進 per-call context', async () => {
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

    await generateRewrite('原文', 'gentle')
    await generateRewrite('原文', 'gentle', undefined, { rephrase: true })

    expect(contexts[0]).toBeUndefined() // 一般潤飾不加料
    expect(contexts[1]).toContain('請換不同的句構與用詞重新潤飾一次')
  })

  it('Prompt API 路徑把重寫要求放進 prompt', async () => {
    const lm = stubLanguageModel()

    await generateRewrite('原文', 'gentle')
    await generateRewrite('原文', 'gentle', undefined, { rephrase: true })

    expect(lm.prompts[0]).not.toContain('請換不同的句構與用詞重新潤飾一次')
    expect(lm.prompts[1]).toContain('請換不同的句構與用詞重新潤飾一次')
    expect(lm.prompts[1]).toContain('不能杜撰或改變原意') // 重寫也不放寬真實性底線
  })
})

describe('generateRewrite：已開始串流後不退回', () => {
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

    await expect(generateRewrite('原文', 'gentle')).rejects.toThrow('串流中斷')
    expect(lm.create).toBe(0)
  })
})

describe('generateRewrite：兩個 API 都沒有', () => {
  it('拋出可讀的錯誤', async () => {
    await expect(generateRewrite('原文', 'gentle')).rejects.toThrow(
      /沒有可用的內建 AI 潤飾功能/,
    )
  })
})
