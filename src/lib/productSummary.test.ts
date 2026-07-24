import { afterEach, describe, expect, it, vi } from 'vitest'
import { availability, generateProductSummary } from './productSummary'

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

// 可控的 LanguageModel stub：promptStreaming 依序吐 chunks，並記錄 create / prompt 參數
function stubLanguageModel(chunks: string[]) {
  const createCalls: CreateCall[] = []
  const promptCalls: PromptCall[] = []
  vi.stubGlobal('LanguageModel', {
    availability: async () => 'available',
    create: async (opts?: LanguageModelCreateOptions) => {
      createCalls.push({ opts })
      return {
        promptStreaming: (input: string) => {
          promptCalls.push({ input })
          return chunkStream(chunks)
        },
        destroy: () => {},
      }
    },
  })
  return { createCalls, promptCalls }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('availability', () => {
  it('沒有 LanguageModel 時回 unavailable', async () => {
    vi.stubGlobal('LanguageModel', undefined)
    expect(await availability()).toBe('unavailable')
  })

  it('有 API 時回傳其 availability', async () => {
    stubLanguageModel(['{}'])
    expect(await availability()).toBe('available')
  })
})

describe('generateProductSummary（串流一段話）', () => {
  it('累加串流 chunks 後回傳完整文字', async () => {
    stubLanguageModel(['釜山', '通行證', '一票暢遊'])
    const result = await generateProductSummary('商品內文')
    expect(result).toBe('釜山通行證一票暢遊')
  })

  it('onChunk 收到逐步累積的內容', async () => {
    stubLanguageModel(['A', 'B', 'C'])
    const seen: string[] = []
    await generateProductSummary('內文', (acc) => seen.push(acc))
    expect(seen).toEqual(['A', 'AB', 'ABC'])
  })

  it('create 不帶選項；promptStreaming 帶上「一段話」指示 + 內文', async () => {
    const { createCalls, promptCalls } = stubLanguageModel(['x'])
    await generateProductSummary('商品內文')
    expect(createCalls[0].opts).toBeUndefined()
    expect(promptCalls[0].input).toContain('一段話') // 指示前綴
    expect(promptCalls[0].input).toContain('商品內文') // 實際內文
  })

  it('不支援 API 時丟出可讀錯誤', async () => {
    vi.stubGlobal('LanguageModel', undefined)
    await expect(generateProductSummary('內文')).rejects.toThrow(/Prompt API/)
  })
})
