import type { Octokit } from '@octokit/core'

export interface FileDiff {
  filename: string
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged'
  patch?: string
  previous_filename?: string
}

export interface DocContent {
  path: string
  content: string
  truncated: boolean
}

export interface DiffResult {
  files: FileDiff[]
  tree: string[]
  truncated: boolean
  docs: DocContent[]
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

const DOC_PATTERNS = [/\.md$/i, /\.mdx$/i, /\.example$/i, /^docs\//i, /^CHANGELOG/i, /^CONTRIBUTING/i]
const MAX_DOC_FILES = 10
const MAX_DOC_CHARS = 8000

async function fetchDocContents(
  octokit: Octokit,
  context: PullContext,
  tree: string[]
): Promise<DocContent[]> {
  const docPaths = tree.filter((p) => DOC_PATTERNS.some((re) => re.test(p))).slice(0, MAX_DOC_FILES)

  const results = await Promise.allSettled(
    docPaths.map(async (path) => {
      const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner: context.owner,
        repo: context.repo,
        path,
        ref: context.mergeCommitSha,
      })
      const data = response.data as { content: string; encoding: string }
      const full = Buffer.from(data.content, 'base64').toString('utf8')
      const truncated = full.length > MAX_DOC_CHARS
      return { path, content: truncated ? full.slice(0, MAX_DOC_CHARS) : full, truncated }
    })
  )

  return results
    .filter((r): r is PromiseFulfilledResult<DocContent> => r.status === 'fulfilled')
    .map((r) => r.value)
}

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

  const docs = await fetchDocContents(octokit, context, tree)

  return { files, tree, truncated, docs }
}
