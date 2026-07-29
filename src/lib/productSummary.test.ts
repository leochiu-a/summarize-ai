import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  generateProductSummary,
  prewarmProductSummary,
  releaseProductSummary,
} from './productSummary'

interface CreateCall {
  opts: LanguageModelCreateOptions | undefined
}
interface PromptCall {
  input: string
}

// 依序吐出 chunks 的 async iterable（模擬 promptStreaming 的 delta 串流）
function chunkStream(chunks: string[]): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c
    },
  }
}

interface FakeSession {
  destroyed: number
}

// 可控的 LanguageModel stub。
// clone() 刻意回傳**另一個物件**並各自記自己的 destroy 次數——真實 API 就是這樣，
// 而「clone 用完丟掉、baseline 留著重用」正是預熱機制的核心契約。若 clone 回傳
// baseline 自己、destroy 又是 no-op，那把 clone 的 destroy 改成收 baseline 也測不出來。
function stubLanguageModel(chunks: string[]) {
  const createCalls: CreateCall[] = []
  const promptCalls: PromptCall[] = []
  const baselines: FakeSession[] = []
  const clones: FakeSession[] = []

  const makeSession = (bucket: FakeSession[]) => {
    const session = {
      destroyed: 0,
      promptStreaming: (input: string) => {
        promptCalls.push({ input })
        return chunkStream(chunks)
      },
      clone: async () => makeSession(clones),
      destroy: () => {
        session.destroyed += 1
      },
    }
    bucket.push(session)
    return session
  }

  vi.stubGlobal('LanguageModel', {
    availability: async () => 'available',
    create: async (opts?: LanguageModelCreateOptions) => {
      createCalls.push({ opts })
      return makeSession(baselines)
    },
  })
  return { createCalls, promptCalls, baselines, clones }
}

afterEach(() => {
  releaseProductSummary() // 預熱的 session 是模組級的，測試間要收掉，否則下一個測試沿用舊 stub
  vi.unstubAllGlobals()
})

describe('generateProductSummary（串流一段話）', () => {
  it('累加串流 chunks 後回傳完整文字', async () => {
    stubLanguageModel(['釜山', '通行證', '一票暢遊'])
    const result = await generateProductSummary('商品內文', 'humorous')
    expect(result).toBe('釜山通行證一票暢遊')
  })

  it('onChunk 收到逐步累積的內容', async () => {
    stubLanguageModel(['A', 'B', 'C'])
    const seen: string[] = []
    await generateProductSummary('內文', 'humorous', (acc) => seen.push(acc))
    expect(seen).toEqual(['A', 'AB', 'ABC'])
  })

  it('指示放在 create 的 system message；promptStreaming 只帶內文', async () => {
    const { createCalls, promptCalls } = stubLanguageModel(['x'])
    await generateProductSummary('商品內文', 'cynical')

    // 規則與語氣在 create 時就送進去（官方建議：initial prompts 於 create 設定）
    const system = createCalls[0].opts?.initialPrompts?.[0]
    expect(system?.role).toBe('system')
    expect(system?.content).toContain('一段話')
    expect(system?.content).toContain('厭世') // 厭世語氣的商品專屬描述有注入

    // prompt 只有內文，不重複規則
    expect(promptCalls[0].input).toContain('商品內文')
    expect(promptCalls[0].input).not.toContain('一段話')
  })

  it('用 clone 出來的 session 提問；clone 用完就收，baseline 留著不重建', async () => {
    const { createCalls, baselines, clones } = stubLanguageModel(['x'])

    await prewarmProductSummary('humorous') // 預熱：建 baseline
    await generateProductSummary('內文', 'humorous')
    await generateProductSummary('內文2', 'humorous')

    expect(createCalls.length).toBe(1) // baseline 只建一次
    expect(clones.length).toBe(2) // 每次生成各 clone 一份
    expect(clones.every((c) => c.destroyed === 1)).toBe(true) // clone 用完就 destroy
    expect(baselines[0].destroyed).toBe(0) // baseline 留著給下一次，沒被誤收
  })

  it('release() 才收掉 baseline', async () => {
    const { baselines } = stubLanguageModel(['x'])

    await generateProductSummary('內文', 'humorous')
    expect(baselines[0].destroyed).toBe(0)

    releaseProductSummary()
    await vi.waitFor(() => expect(baselines[0].destroyed).toBe(1))
  })

  it('語氣換了 → 重建 baseline（system 指示要換）', async () => {
    const { createCalls } = stubLanguageModel(['x'])

    await generateProductSummary('內文', 'humorous')
    await generateProductSummary('內文', 'cynical')

    expect(createCalls.length).toBe(2)
  })

  it('不支援 API 時丟出可讀錯誤', async () => {
    vi.stubGlobal('LanguageModel', undefined)
    await expect(generateProductSummary('內文', 'humorous')).rejects.toThrow(/Prompt API/)
  })
})
