import type { Octokit } from '@octokit/core'

export interface FileDiff {
  filename: string
  patch?: string
}

export interface DiffResult {
  files: FileDiff[]
  tree: string[]
  truncated: boolean
}

export interface PullContext {
  owner: string
  repo: string
  pullNumber: number
  mergeCommitSha: string
  defaultBranch: string
}

// Configurable via MAX_FILES env var (default: 50)
export const MAX_FILES = Number(process.env.MAX_FILES) || 50

export async function fetchDiff(octokit: Octokit, context: PullContext): Promise<DiffResult> {
  const [filesResponse, treeResponse] = await Promise.all([
    octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
      owner: context.owner,
      repo: context.repo,
      pull_number: context.pullNumber,
      per_page: 100,
    }),
    octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
      owner: context.owner,
      repo: context.repo,
      tree_sha: context.mergeCommitSha,
      recursive: '1',
    }),
  ])

  const apiTreeTruncated = !!(treeResponse.data as { truncated?: boolean }).truncated
  const allFiles = filesResponse.data as FileDiff[]
  const truncated = allFiles.length > MAX_FILES || apiTreeTruncated
  const files = allFiles.length > MAX_FILES ? allFiles.slice(0, MAX_FILES) : allFiles

  const tree = (treeResponse.data.tree as { path?: string }[])
    .map((item) => item.path)
    .filter((p): p is string => Boolean(p))

  return { files, tree, truncated }
}
