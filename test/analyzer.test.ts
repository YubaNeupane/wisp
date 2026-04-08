import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LLMAdapter } from '../src/llm/adapter.js'
import type { DiffResult } from '../src/diff/fetcher.js'

const mockDiff: DiffResult = {
  files: [{ filename: 'src/auth.ts', patch: '@@ -1,3 +1,5 @@\n+export function login() {}' }],
  tree: ['README.md', 'docs/api.md', 'src/auth.ts'],
  truncated: false,
}

const mockLog = { warn: vi.fn(), error: vi.fn() }

describe('analyze', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns updates from a valid LLM response', async () => {
    const { analyze } = await import('../src/analysis/analyzer.js')
    const adapter: LLMAdapter = {
      send: vi.fn().mockResolvedValue(
        JSON.stringify({
          updates: [{ path: 'README.md', content: '# Updated README', reason: 'Added login section' }],
        })
      ),
    }
    const result = await analyze(mockDiff, adapter, mockLog)
    expect(result.updates).toHaveLength(1)
    expect(result.updates[0].path).toBe('README.md')
    expect(result.updates[0].content).toBe('# Updated README')
    expect(result.updates[0].reason).toBe('Added login section')
  })

  it('returns empty updates when LLM returns no changes needed', async () => {
    const { analyze } = await import('../src/analysis/analyzer.js')
    const adapter: LLMAdapter = {
      send: vi.fn().mockResolvedValue(JSON.stringify({ updates: [] })),
    }
    const result = await analyze(mockDiff, adapter, mockLog)
    expect(result.updates).toHaveLength(0)
  })

  it('returns empty updates and warns on malformed JSON', async () => {
    const { analyze } = await import('../src/analysis/analyzer.js')
    const adapter: LLMAdapter = {
      send: vi.fn().mockResolvedValue('Sure! Here are my suggestions: ...'),
    }
    const result = await analyze(mockDiff, adapter, mockLog)
    expect(result.updates).toHaveLength(0)
    expect(mockLog.warn).toHaveBeenCalled()
  })

  it('returns empty updates and logs error when LLM throws', async () => {
    const { analyze } = await import('../src/analysis/analyzer.js')
    const adapter: LLMAdapter = {
      send: vi.fn().mockRejectedValue(new Error('Network timeout')),
    }
    const result = await analyze(mockDiff, adapter, mockLog)
    expect(result.updates).toHaveLength(0)
    expect(mockLog.error).toHaveBeenCalled()
  })

  it('includes the file tree and diff patch in the prompt', async () => {
    const { analyze } = await import('../src/analysis/analyzer.js')
    const adapter: LLMAdapter = {
      send: vi.fn().mockResolvedValue(JSON.stringify({ updates: [] })),
    }
    await analyze(mockDiff, adapter, mockLog)
    const prompt = (adapter.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prompt).toContain('README.md')
    expect(prompt).toContain('src/auth.ts')
    expect(prompt).toContain('login')
  })

  it('notes truncation in the prompt when diff was truncated', async () => {
    const { analyze } = await import('../src/analysis/analyzer.js')
    const truncatedDiff: DiffResult = { ...mockDiff, truncated: true }
    const adapter: LLMAdapter = {
      send: vi.fn().mockResolvedValue(JSON.stringify({ updates: [] })),
    }
    await analyze(truncatedDiff, adapter, mockLog)
    const prompt = (adapter.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prompt).toContain('50')
  })
})
