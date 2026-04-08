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
  log: Log
): Promise<void> {
  const { owner, repo, defaultBranch, mergeCommitSha } = context
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

    await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner,
      repo,
      path: update.path,
      message: '[Wisp] Update documentation',
      content: encoded,
      branch: branchName,
      ...(fileSha !== undefined ? { sha: fileSha } : {}),
    })
  }

  const body =
    `This PR was automatically opened by Wisp to keep documentation in sync.\n\n` +
    `## Updated Files\n\n` +
    updates.map((u) => `- **${u.path}**: ${u.reason}`).join('\n')

  await octokit.request('POST /repos/{owner}/{repo}/pulls', {
    owner,
    repo,
    title: '[Wisp] Documentation Sync',
    body,
    head: branchName,
    base: defaultBranch,
  })

  log.info(`[Wisp] Opened documentation sync PR: ${branchName}`)
}
