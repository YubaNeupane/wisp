import type { Octokit } from '@octokit/core'
import type { PullContext } from '../diff/fetcher.js'
import type { DocUpdate } from '../analysis/analyzer.js'

type Log = {
  info: (msg: string) => void
  error: (msg: string, err?: unknown) => void
}

export async function postDocSyncComment(
  octokit: Octokit,
  context: PullContext,
  updates: DocUpdate[],
  log: Log
): Promise<void> {
  try {
    const details = updates
      .map((u) => {
        const ext = u.path.split('.').pop() ?? ''
        return `<details>\n<summary><code>${u.path}</code> — ${u.reason}</summary>\n\n\`\`\`${ext}\n${u.content}\n\`\`\`\n\n</details>`
      })
      .join('\n\n')

    const body = `## Wisp Documentation Sync

Wisp detected documentation that needs updating. Review and apply the suggestions below.

${details}

---
<sub>Suggested by Wisp · Apply manually or let Wisp open a sync PR by setting \`mode: pr\` in .wisp.yml</sub>`

    await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
      owner: context.owner,
      repo: context.repo,
      issue_number: context.pullNumber,
      body,
    })
    log.info(`[Wisp] Posted documentation sync comment on PR #${context.pullNumber}`)
  } catch (err) {
    log.error('Failed to post documentation sync comment', err)
  }
}
