import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAdapter } from '../src/llm/adapter.js'

describe('createAdapter', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  it('throws when LLM_PROVIDER is not set', () => {
    vi.stubEnv('LLM_PROVIDER', '')
    expect(() => createAdapter()).toThrow('LLM_PROVIDER must be set')
  })

  it('returns an adapter with a send method when LLM_PROVIDER=anthropic', () => {
    vi.stubEnv('LLM_PROVIDER', 'anthropic')
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    const adapter = createAdapter()
    expect(typeof adapter.send).toBe('function')
  })

  it('returns an adapter with a send method when LLM_PROVIDER=openai', () => {
    vi.stubEnv('LLM_PROVIDER', 'openai')
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    const adapter = createAdapter()
    expect(typeof adapter.send).toBe('function')
  })

  it('throws for unknown provider', () => {
    vi.stubEnv('LLM_PROVIDER', 'gemini')
    expect(() => createAdapter()).toThrow('Unknown LLM_PROVIDER: gemini')
  })
})
