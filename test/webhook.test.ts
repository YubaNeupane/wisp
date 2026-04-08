import { describe, it, expect, vi, beforeEach } from 'vitest'

// Control the LLM response per test via this variable
let mockLLMResponse = JSON.stringify({
  updates: [{ path: 'README.md', content: '# Updated', reason: 'login added' }],
})

vi.mock('../src/diff/fetcher.js', () => ({
  fetchDiff: vi.fn().mockResolvedValue({
    files: [{ filename: 'src/auth.ts', patch: '@@ -1 +1 @@\n+export function login() {}' }],
    tree: ['README.md', 'src/auth.ts'],
    truncated: false,
  }),
}))

vi.mock('../src/llm/adapter.js', () => ({
  createAdapter: vi.fn(() => ({
    send: vi.fn(() => Promise.resolve(mockLLMResponse)),
  })),
}))

const mockCreateDocSyncPR = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('../src/pr/creator.js', () => ({
  createDocSyncPR: mockCreateDocSyncPR,
}))

import { handleMergedPR } from '../src/webhook/handler.js'

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const mockOctokit = {} as any

const mergedPayload = {
  pull_request: { merged: true, number: 1, merge_commit_sha: 'abc123def456' },
  repository: { owner: { login: 'acme' }, name: 'app', default_branch: 'main' },
}

describe('integration: documentation sync pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLLMResponse = JSON.stringify({
      updates: [{ path: 'README.md', content: '# Updated', reason: 'login added' }],
    })
  })

  it('runs the full pipeline without throwing', async () => {
    await expect(handleMergedPR(mockOctokit, mergedPayload, mockLog)).resolves.not.toThrow()
  })

  it('calls createDocSyncPR with the right arguments when LLM returns updates', async () => {
    await handleMergedPR(mockOctokit, mergedPayload, mockLog)
    expect(mockCreateDocSyncPR).toHaveBeenCalledOnce()
    expect(mockCreateDocSyncPR).toHaveBeenCalledWith(
      mockOctokit,
      expect.objectContaining({ owner: 'acme', repo: 'app', pullNumber: 1 }),
      expect.arrayContaining([expect.objectContaining({ path: 'README.md' })]),
      mockLog
    )
  })

  it('skips createDocSyncPR when LLM returns no updates', async () => {
    mockLLMResponse = JSON.stringify({ updates: [] })
    await handleMergedPR(mockOctokit, mergedPayload, mockLog)
    expect(mockCreateDocSyncPR).not.toHaveBeenCalled()
  })

  it('skips the pipeline for unmerged PRs', async () => {
    const unmergedPayload = {
      ...mergedPayload,
      pull_request: { ...mergedPayload.pull_request, merged: false },
    }
    await handleMergedPR(mockOctokit, unmergedPayload, mockLog)
    expect(mockCreateDocSyncPR).not.toHaveBeenCalled()
  })

  it('logs error and skips PR creation when fetchDiff throws', async () => {
    const { fetchDiff } = await import('../src/diff/fetcher.js')
    vi.mocked(fetchDiff).mockRejectedValueOnce(new Error('GitHub API error'))
    await handleMergedPR(mockOctokit, mergedPayload, mockLog)
    expect(mockCreateDocSyncPR).not.toHaveBeenCalled()
    expect(mockLog.error).toHaveBeenCalled()
  })

  it('logs error when createDocSyncPR throws', async () => {
    mockCreateDocSyncPR.mockRejectedValueOnce(new Error('GitHub API error'))
    await handleMergedPR(mockOctokit, mergedPayload, mockLog)
    expect(mockLog.error).toHaveBeenCalled()
  })
})
