import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createDocSyncPR } from '../src/pr/creator.js'
import type { PullContext } from '../src/diff/fetcher.js'
import type { DocUpdate } from '../src/analysis/analyzer.js'

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
        return Promise.reject(Object.assign(new Error('Not Found'), { status: 404 }))
      }
      if (route === 'PUT /repos/{owner}/{repo}/contents/{path}') {
        return Promise.resolve({})
      }
      if (route === 'POST /repos/{owner}/{repo}/labels') {
        return Promise.resolve({})
      }
      if (route === 'POST /repos/{owner}/{repo}/pulls') {
        return Promise.resolve({ data: { html_url: 'https://github.com/acme/app/pull/43', number: 43 } })
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
    await createDocSyncPR(octokit as any, mockContext, mockUpdates, 'alice', mockLog)
    const refCall = (octokit.request as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'POST /repos/{owner}/{repo}/git/refs'
    )
    expect(refCall?.[1].ref).toBe('refs/heads/wisp/docs-sync-abc1234')
  })

  it('commits each file with a descriptive message including the reason', async () => {
    const octokit = makeMockOctokit()
    await createDocSyncPR(octokit as any, mockContext, mockUpdates, 'alice', mockLog)
    const putCall = (octokit.request as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'PUT /repos/{owner}/{repo}/contents/{path}'
    )
    expect(putCall?.[1].message).toBe('docs(README.md): Added login section')
    expect(putCall?.[1].path).toBe('README.md')
  })

  it('opens a PR referencing the triggering PR number targeting the default branch', async () => {
    const octokit = makeMockOctokit()
    await createDocSyncPR(octokit as any, mockContext, mockUpdates, 'alice', mockLog)
    const prCall = (octokit.request as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'POST /repos/{owner}/{repo}/pulls'
    )
    expect(prCall?.[1].title).toBe('docs: sync documentation for #42')
    expect(prCall?.[1].base).toBe('main')
    expect(prCall?.[1].head).toBe('wisp/docs-sync-abc1234')
  })

  it('returns the URL of the opened PR', async () => {
    const octokit = makeMockOctokit()
    const result = await createDocSyncPR(octokit as any, mockContext, mockUpdates, 'alice', mockLog)
    expect(result.url).toBe('https://github.com/acme/app/pull/43')
  })

  it('assigns the docs PR to the original PR author', async () => {
    const octokit = makeMockOctokit()
    await createDocSyncPR(octokit as any, mockContext, mockUpdates, 'alice', mockLog)
    const assignCall = (octokit.request as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'POST /repos/{owner}/{repo}/issues/{issue_number}/assignees'
    )
    expect(assignCall?.[1].assignees).toContain('alice')
  })

  it('includes the file SHA when updating an existing file', async () => {
    const octokit = makeMockOctokit('existing-file-sha')
    await createDocSyncPR(octokit as any, mockContext, mockUpdates, 'alice', mockLog)
    const putCall = (octokit.request as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'PUT /repos/{owner}/{repo}/contents/{path}'
    )
    expect(putCall?.[1].sha).toBe('existing-file-sha')
  })

  it('omits SHA when creating a new file', async () => {
    const octokit = makeMockOctokit()
    await createDocSyncPR(octokit as any, mockContext, mockUpdates, 'alice', mockLog)
    const putCall = (octokit.request as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'PUT /repos/{owner}/{repo}/contents/{path}'
    )
    expect(putCall?.[1].sha).toBeUndefined()
  })

  it('succeeds when branch already exists (duplicate webhook delivery)', async () => {
    const octokit = {
      request: vi.fn().mockImplementation((route: string) => {
        if (route === 'GET /repos/{owner}/{repo}/git/ref/{ref}') {
          return Promise.resolve({ data: { object: { sha: 'base-sha-000' } } })
        }
        if (route === 'POST /repos/{owner}/{repo}/git/refs') {
          const err = Object.assign(new Error('Reference already exists'), { status: 422 })
          return Promise.reject(err)
        }
        if (route === 'GET /repos/{owner}/{repo}/contents/{path}') {
          return Promise.reject(Object.assign(new Error('Not Found'), { status: 404 }))
        }
        if (route === 'PUT /repos/{owner}/{repo}/contents/{path}') {
          return Promise.resolve({})
        }
        if (route === 'POST /repos/{owner}/{repo}/pulls') {
          return Promise.resolve({ data: { html_url: 'https://github.com/acme/app/pull/43', number: 43 } })
        }
        return Promise.resolve({})
      }),
    }
    await expect(
      createDocSyncPR(octokit as any, mockContext, mockUpdates, 'alice', mockLog)
    ).resolves.not.toThrow()
  })
})
