import type { Octokit } from '@octokit/core'
import { fetchDiff, type PullContext } from '../diff/fetcher.js'
import { analyze } from '../analysis/analyzer.js'
import { createDocSyncPR } from '../pr/creator.js'
import { createAdapter } from '../llm/adapter.js'

type Log = {
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string, err?: unknown) => void
}

type MergedPRPayload = {
  pull_request: {
    merged: boolean
    number: number
    merge_commit_sha: string | null // non-null when merged === true per GitHub API contract
  }
  repository: {
    owner: { login: string }
    name: string
    default_branch: string
  }
}

export async function handleMergedPR(
  octokit: Octokit,
  payload: MergedPRPayload,
  log: Log
): Promise<void> {
  if (!payload.pull_request.merged) return
  const sha = payload.pull_request.merge_commit_sha
  if (!sha) {
    log.error('merged PR has no merge_commit_sha — skipping')
    return
  }

  const context: PullContext = {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    pullNumber: payload.pull_request.number,
    mergeCommitSha: sha,
    defaultBranch: payload.repository.default_branch,
  }

  let diff
  try {
    diff = await fetchDiff(octokit, context)
  } catch (err) {
    log.error('Failed to fetch diff', err)
    return
  }

  let adapter
  try {
    adapter = createAdapter()
  } catch (err) {
    log.error('Failed to create LLM adapter (check LLM_PROVIDER env var)', err)
    return
  }
  const { updates } = await analyze(diff, adapter, log)

  if (updates.length === 0) {
    log.info(`[Wisp] No documentation updates needed for PR #${context.pullNumber}`)
    return
  }

  try {
    await createDocSyncPR(octokit, context, updates, log)
  } catch (err) {
    log.error('Failed to create documentation sync PR', err)
  }
}
