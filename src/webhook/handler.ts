import type { Octokit } from '@octokit/core'
import { fetchDiff, type PullContext } from '../diff/fetcher.js'
import { analyze } from '../analysis/analyzer.js'
import { createDocSyncPR } from '../pr/creator.js'
import { postDocSyncComment } from '../pr/commenter.js'
import { createAdapter } from '../llm/adapter.js'
import { loadConfig } from '../config/loader.js'
import { writeAuditLog } from '../audit/logger.js'

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
    head: { ref: string; sha: string }
    labels: Array<{ name: string }>
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



function matchesPathPrefix(filePath: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => filePath === prefix || filePath.startsWith(prefix + '/') || filePath.startsWith(prefix))
}

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

  const owner = payload.repository.owner.login
  const repo = payload.repository.name
  const headSha = payload.pull_request.head.sha
  const prLabels = payload.pull_request.labels.map((l) => l.name)

  const context: PullContext = {
    owner,
    repo,
    pullNumber: payload.pull_request.number,
    mergeCommitSha: sha,
    defaultBranch: payload.repository.default_branch,
  }

  const pr = {
    title: payload.pull_request.title,
    body: payload.pull_request.body,
  }

  // Load .wisp.yml config (errors treated as empty config)
  const config = await loadConfig(octokit, context)

  // Merge config.ignore_authors with built-in BOT_AUTHORS
  const ignoredAuthors = new Set([...BOT_AUTHORS, ...(config.ignore_authors ?? [])])
  if (ignoredAuthors.has(prAuthor) && !BOT_AUTHORS.has(prAuthor)) {
    log.info(`[Wisp] PR #${context.pullNumber} by "${prAuthor}" — skipping (in config ignore_authors)`)
    return
  }

  // Check if any PR label is in config.ignore_labels
  if (config.ignore_labels && config.ignore_labels.length > 0) {
    const matchedLabel = prLabels.find((l) => config.ignore_labels!.includes(l))
    if (matchedLabel) {
      log.info(`[Wisp] PR #${context.pullNumber} has ignored label "${matchedLabel}" — skipping`)
      return
    }
  }

  log.info(`[Wisp] PR #${context.pullNumber} merged in ${owner}/${repo} — fetching diff`)



  let diff
  try {
    diff = await fetchDiff(octokit, context)
  } catch (err) {
    log.error('Failed to fetch diff', err)
    return
  }

  log.info(`[Wisp] Fetched diff: ${diff.files.length} file(s)${diff.truncated ? ' (truncated)' : ''} — calling LLM`)

  // Apply doc focus/ignore filtering to diff.docs
  let filteredDocs = diff.docs
  if (config.docs?.focus && config.docs.focus.length > 0) {
    filteredDocs = filteredDocs.filter((d) => matchesPathPrefix(d.path, config.docs!.focus!))
  }
  if (config.docs?.ignore && config.docs.ignore.length > 0) {
    filteredDocs = filteredDocs.filter((d) => !matchesPathPrefix(d.path, config.docs!.ignore!))
  }
  const filteredDiff = { ...diff, docs: filteredDocs }

  // Build custom instructions from config
  const instructionParts: string[] = []
  if (config.docs?.focus && config.docs.focus.length > 0) {
    instructionParts.push(`Only update documentation files matching these paths/prefixes: ${config.docs.focus.join(', ')}.`)
  }
  if (config.docs?.ignore && config.docs.ignore.length > 0) {
    instructionParts.push(`Do NOT update documentation files matching these paths/prefixes: ${config.docs.ignore.join(', ')}.`)
  }
  if (config.instructions) {
    instructionParts.push(config.instructions)
  }
  const customInstructions = instructionParts.length > 0 ? instructionParts.join('\n\n') : undefined

  let adapter
  try {
    adapter = createAdapter()
  } catch (err) {
    log.error('Failed to create LLM adapter (check LLM_PROVIDER env var)', err)
    return
  }
  const { updates: rawUpdates } = await analyze(filteredDiff, pr, adapter, log, { customInstructions })

  // Post-filter updates based on config.docs.focus and config.docs.ignore
  let updates = rawUpdates
  if (config.docs?.focus && config.docs.focus.length > 0) {
    updates = updates.filter((u) => matchesPathPrefix(u.path, config.docs!.focus!))
  }
  if (config.docs?.ignore && config.docs.ignore.length > 0) {
    updates = updates.filter((u) => !matchesPathPrefix(u.path, config.docs!.ignore!))
  }

  if (updates.length === 0) {
    log.info(`[Wisp] No documentation updates needed for PR #${context.pullNumber}`)
    await writeAuditLog(context, [], 'no_updates_needed')
    return
  }

  log.info(`[Wisp] LLM suggested ${updates.length} doc update(s): ${updates.map((u) => u.path).join(', ')}`)

  if (config.mode === 'comment') {
    await postDocSyncComment(octokit, context, updates, log)
    await writeAuditLog(context, updates, 'synced')
    return
  }

  // Default: pr mode
  let docsPR: { url: string; title: string } | undefined
  try {
    docsPR = await createDocSyncPR(octokit, context, updates, prAuthor, log, config.pr?.draft ?? false)
  } catch (err) {
    log.error('Failed to create documentation sync PR', err)
    await writeAuditLog(context, updates, 'error', String(err instanceof Error ? err.message : err))
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

  await writeAuditLog(context, updates, 'synced')
}
