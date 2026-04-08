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
    title: string
    body: string | null
    user: { login: string }
    head: { ref: string }
  }
  repository: {
    owner: { login: string }
    name: string
    default_branch: string
  }
}

const BOT_AUTHORS = new Set([
  'dependabot[bot]',
  'renovate[bot]',
  'github-actions[bot]',
  'github-merge-queue[bot]',
])

export async function handleMergedPR(
  octokit: Octokit,
  payload: MergedPRPayload,
  log: Log
): Promise<void> {
  if (!payload.pull_request.merged) {
    log.info(`[Wisp] PR #${payload.pull_request.number} closed but not merged — skipping`)
    return
  }

  const sha = payload.pull_request.merge_commit_sha
  if (!sha) {
    log.error('merged PR has no merge_commit_sha — skipping')
    return
  }

  // Skip Wisp's own documentation sync PRs to prevent infinite loops
  if (payload.pull_request.head.ref.startsWith('wisp/')) {
    log.info(`[Wisp] PR #${payload.pull_request.number} is a Wisp sync branch — skipping`)
    return
  }

  // Skip automated bot PRs (dependabot, renovate, etc.)
  const prAuthor = payload.pull_request.user.login
  if (BOT_AUTHORS.has(prAuthor)) {
    log.info(`[Wisp] PR #${payload.pull_request.number} by "${prAuthor}" — skipping bot PR`)
    return
  }

  const context: PullContext = {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    pullNumber: payload.pull_request.number,
    mergeCommitSha: sha,
    defaultBranch: payload.repository.default_branch,
  }

  const pr = {
    title: payload.pull_request.title,
    body: payload.pull_request.body,
  }

  log.info(`[Wisp] PR #${context.pullNumber} merged in ${context.owner}/${context.repo} — fetching diff`)

  let diff
  try {
    diff = await fetchDiff(octokit, context)
  } catch (err) {
    log.error('Failed to fetch diff', err)
    return
  }

  log.info(`[Wisp] Fetched diff: ${diff.files.length} file(s)${diff.truncated ? ' (truncated)' : ''} — calling LLM`)

  let adapter
  try {
    adapter = createAdapter()
  } catch (err) {
    log.error('Failed to create LLM adapter (check LLM_PROVIDER env var)', err)
    return
  }
  const { updates } = await analyze(diff, pr, adapter, log)

  if (updates.length === 0) {
    log.info(`[Wisp] No documentation updates needed for PR #${context.pullNumber}`)
    return
  }

  log.info(`[Wisp] LLM suggested ${updates.length} doc update(s): ${updates.map((u) => u.path).join(', ')}`)

  let docsPR: { url: string; title: string } | undefined
  try {
    docsPR = await createDocSyncPR(octokit, context, updates, prAuthor, log)
  } catch (err) {
    log.error('Failed to create documentation sync PR', err)
    return
  }

  // Comment on the original PR with a link to the docs sync PR
  try {
    await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
      owner: context.owner,
      repo: context.repo,
      issue_number: context.pullNumber,
      body: `**[Wisp]** opened a documentation sync PR based on this merge.\n\n→ [${docsPR.title}](${docsPR.url})\n\nReview the changes and merge when ready.`,
    })
  } catch (err) {
    log.error('Failed to post comment on PR', err)
  }
}
