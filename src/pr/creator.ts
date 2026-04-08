import type { Octokit } from '@octokit/core'
import type { PullContext } from '../diff/fetcher.js'
import type { DocUpdate } from '../analysis/analyzer.js'

type Log = {
  info: (msg: string) => void
  error: (msg: string, err?: unknown) => void
}

export async function createDocSyncPR(
  octokit: Octokit,
  context: PullContext,
  updates: DocUpdate[],
  prAuthor: string,
  log: Log,
  draft = false
): Promise<{ url: string; title: string }> {
  const { owner, repo, pullNumber, defaultBranch, mergeCommitSha } = context
  const branchName = `wisp/docs-sync-${mergeCommitSha.slice(0, 7)}`

  const refResponse = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  })
  const baseSha = (refResponse.data as { object: { sha: string } }).object.sha

  try {
    await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    })
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status !== 422) throw err
    // Branch already exists (duplicate webhook delivery) — continue
  }

  // Serial loop required: each PUT creates a commit; concurrent writes would cause 409 conflicts
  for (const update of updates) {
    const encoded = Buffer.from(update.content).toString('base64')
    let fileSha: string | undefined

    try {
      const existing = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner,
        repo,
        path: update.path,
        ref: branchName,
      })
      fileSha = (existing.data as { sha: string }).sha
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status !== 404) throw err
      // File does not exist yet — no SHA needed for creation
    }

    const shortReason = update.reason.length > 72 ? update.reason.slice(0, 69) + '...' : update.reason
    await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner,
      repo,
      path: update.path,
      message: `docs(${update.path}): ${shortReason}`,
      content: encoded,
      branch: branchName,
      ...(fileSha !== undefined ? { sha: fileSha } : {}),
    })
  }

  // Ensure the documentation label exists before creating the PR
  try {
    await octokit.request('POST /repos/{owner}/{repo}/labels', {
      owner,
      repo,
      name: 'documentation',
      color: '0075ca',
      description: 'Improvements or additions to documentation',
    })
  } catch (err) {
    // 422 = label already exists — expected on all runs after the first
    if ((err as { status?: number }).status !== 422) {
      log.error('Failed to ensure documentation label', err)
    }
  }

  const fileList = updates
    .map((u) => `**\`${u.path}\`** — ${u.reason}`)
    .join('\n\n')

  const prTitle = `docs: sync documentation for #${pullNumber}`
  const body = `## Documentation Sync

Wisp detected documentation that needs updating following the merge of #${pullNumber}.

### Updated Files

${fileList}

---

<sub>Opened automatically by Wisp · Review carefully before merging</sub>`

  const prResponse = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
    owner,
    repo,
    title: prTitle,
    body,
    head: branchName,
    base: defaultBranch,
    draft,
  })

  const prData = prResponse.data as { html_url: string; number: number }

  // Add label and assign to the author of the triggering PR in parallel
  await Promise.all([
    octokit
      .request('POST /repos/{owner}/{repo}/issues/{issue_number}/labels', {
        owner,
        repo,
        issue_number: prData.number,
        labels: ['documentation'],
      })
      .catch((err) => log.error('Failed to add label to docs PR', err)),
    octokit
      .request('POST /repos/{owner}/{repo}/issues/{issue_number}/assignees', {
        owner,
        repo,
        issue_number: prData.number,
        assignees: [prAuthor],
      })
      .catch((err) => log.error('Failed to assign docs PR', err)),
  ])

  log.info(`[Wisp] Opened documentation sync PR for #${pullNumber}: ${prData.html_url}`)
  return { url: prData.html_url, title: prTitle }
}
