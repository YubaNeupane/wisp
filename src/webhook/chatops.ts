import type { Octokit } from '@octokit/core'
import { commitUpdatesToBranch } from '../pr/creator.js'
import type { DocUpdate } from '../analysis/analyzer.js'

type Log = {
  info: (msg: string) => void
  error: (msg: string, err?: unknown) => void
}

export function parseWispComment(body: string): DocUpdate[] {
  const updates: DocUpdate[] = []
  
  // Wisp's comment format:
  // <details>\n<summary><code>{path}</code> — {reason}</summary>\n\n```{ext}\n{content}\n```\n\n</details>
  const sections = body.split('<details>')
  for (const section of sections) {
    if (!section.includes('</details>')) continue
    const summaryMatch = section.match(/<summary><code>(.*?)<\/code> — (.*?)<\/summary>/)
    if (!summaryMatch) continue

    const path = summaryMatch[1]
    const reason = 'Applied via @wisp apply'

    const codeBlockMatch = section.match(/```[a-zA-Z0-9-]*\n([\s\S]*?)\n```/)
    if (!codeBlockMatch) continue

    const content = codeBlockMatch[1]
    updates.push({ path, content, reason })
  }
  return updates
}

export async function handleIssueComment(octokit: Octokit, payload: any, log: Log): Promise<void> {
  // We only care about new comments
  if (payload.action !== 'created') return
  // We only care about PR comments (issues with a pull_request property)
  if (!payload.issue.pull_request) return
  // We only care about `@wisp apply` exactly
  if (payload.comment.body.trim().toLowerCase() !== '@wisp apply') return

  const owner = payload.repository.owner.login
  const repo = payload.repository.name
  const pullNumber = payload.issue.number
  const defaultBranch = payload.repository.default_branch

  log.info(`[Wisp] Detected '@wisp apply' command on PR #${pullNumber}`)

  // 1. Acknowledge command with a +1 reaction
  await octokit.request('POST /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions', {
    owner,
    repo,
    comment_id: payload.comment.id,
    content: '+1'
  }).catch(() => {})

  try {
    // 2. Fetch all comments on this PR
    const commentsResponse = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}/comments', {
      owner,
      repo,
      issue_number: pullNumber,
      per_page: 100
    })

    // 3. Find the latest Wisp bot comment containing the sync payload
    const wispComments = commentsResponse.data.filter((c: any) => 
      c.body?.includes('## Wisp Documentation Sync')
    )
    
    if (wispComments.length === 0) {
      log.info(`[Wisp] Could not find a Wisp documentation sync comment to apply.`)
      await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
        owner,
        repo,
        issue_number: pullNumber,
        body: `❌ **Failed to apply:** I couldn't find a previous Wisp sync comment on this PR.`
      })
      return
    }

    const latestComment = wispComments[wispComments.length - 1].body
    
    // 4. Parse the markdown
    const updates = parseWispComment(latestComment)

    if (updates.length === 0) {
      log.info(`[Wisp] No parsed doc updates found in the comment.`)
      return
    }

    log.info(`[Wisp] Extracted ${updates.length} files from comment. Committing to ${defaultBranch}...`)

    // 5. Commit directly to main/defaultBranch
    await commitUpdatesToBranch(octokit, owner, repo, defaultBranch, updates)

    // 6. Post success comment and rocket reaction
    await octokit.request('POST /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions', {
      owner,
      repo,
      comment_id: payload.comment.id,
      content: 'rocket'
    }).catch(() => {})

    await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
      owner,
      repo,
      issue_number: pullNumber,
      body: `✅ **Successfully applied \`${updates.length}\` documentation updates directly to \`${defaultBranch}\`!**`
    })

  } catch (err) {
    log.error('Failed to apply chatops command', err)
    await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
      owner,
      repo,
      issue_number: pullNumber,
      body: `❌ **Failed to apply updates:** ${err instanceof Error ? err.message : 'Unknown error'}`
    }).catch(() => {})
  }
}
