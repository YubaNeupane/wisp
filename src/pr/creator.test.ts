import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createDocSyncPR } from './creator.js'
import type { PullContext } from '../diff/fetcher.js'
import type { DocUpdate } from '../analysis/analyzer.js'

const mockContext: PullContext = {
  owner: 'acme',
  repo: 'app',
  pullNumber: 42,
  mergeCommitSha: 'abc1234def5678',
  defaultBranch: 'main',
}

const mockUpdates: DocUpdate[] = [
  { path: 'README.md', content: '# Updated README', reason: 'Added login section' },
]

const mockLog = { info: vi.fn(), error: vi.fn() }

function makeMockOctokit(existingFileSha?: string) {
  return {
    request: vi.fn().mockImplementation((route: string) => {
      if (route === 'GET /repos/{owner}/{repo}/git/ref/{ref}') {
        return Promise.resolve({ data: { object: { sha: 'base-sha-000' } } })
      }
      if (route === 'POST /repos/{owner}/{repo}/git/refs') {
        return Promise.resolve({})
      }
      if (route === 'GET /repos/{owner}/{repo}/contents/{path}') {
        if (existingFileSha) return Promise.resolve({ data: { sha: existingFileSha } })
        return Promise.reject(new Error('Not Found'))
      }
      if (route === 'PUT /repos/{owner}/{repo}/contents/{path}') {
        return Promise.resolve({})
      }
      if (route === 'POST /repos/{owner}/{repo}/pulls') {
        return Promise.resolve({})
      }
      return Promise.resolve({})
    }),
  }
}

describe('createDocSyncPR', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a branch named wisp/docs-sync-<first 7 chars of sha>', async () => {
    const octokit = makeMockOctokit()
    await createDocSyncPR(octokit as any, mockContext, mockUpdates, mockLog)
    const refCall = (octokit.request as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'POST /repos/{owner}/{repo}/git/refs'
    )
    expect(refCall?.[1].ref).toBe('refs/heads/wisp/docs-sync-abc1234')
  })

  it('commits each file with message "[Wisp] Update documentation"', async () => {
    const octokit = makeMockOctokit()
    await createDocSyncPR(octokit as any, mockContext, mockUpdates, mockLog)
    const putCall = (octokit.request as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'PUT /repos/{owner}/{repo}/contents/{path}'
    )
    expect(putCall?.[1].message).toBe('[Wisp] Update documentation')
    expect(putCall?.[1].path).toBe('README.md')
  })

  it('opens a PR with title "[Wisp] Documentation Sync" targeting the default branch', async () => {
    const octokit = makeMockOctokit()
    await createDocSyncPR(octokit as any, mockContext, mockUpdates, mockLog)
    const prCall = (octokit.request as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'POST /repos/{owner}/{repo}/pulls'
    )
    expect(prCall?.[1].title).toBe('[Wisp] Documentation Sync')
    expect(prCall?.[1].base).toBe('main')
    expect(prCall?.[1].head).toBe('wisp/docs-sync-abc1234')
  })

  it('includes the file SHA when updating an existing file', async () => {
    const octokit = makeMockOctokit('existing-file-sha')
    await createDocSyncPR(octokit as any, mockContext, mockUpdates, mockLog)
    const putCall = (octokit.request as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'PUT /repos/{owner}/{repo}/contents/{path}'
    )
    expect(putCall?.[1].sha).toBe('existing-file-sha')
  })

  it('omits SHA when creating a new file', async () => {
    const octokit = makeMockOctokit()
    await createDocSyncPR(octokit as any, mockContext, mockUpdates, mockLog)
    const putCall = (octokit.request as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'PUT /repos/{owner}/{repo}/contents/{path}'
    )
    expect(putCall?.[1].sha).toBeUndefined()
  })
})
