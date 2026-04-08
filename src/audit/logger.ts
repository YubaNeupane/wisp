import { promises as fs } from 'fs'
import path from 'path'
import type { PullContext } from '../diff/fetcher.js'
import type { DocUpdate } from '../analysis/analyzer.js'

export async function writeAuditLog(
  context: PullContext,
  updates: DocUpdate[],
  status: 'synced' | 'no_updates_needed' | 'error',
  errorMsg?: string
): Promise<void> {
  if (process.env.WISP_AUDIT_LOG !== 'true') return

  const logPath = process.env.WISP_AUDIT_LOG_PATH || '.wisp/audit.log'
  const absolutePath = path.resolve(process.cwd(), logPath)

  try {
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })

    const payload = {
      timestamp: new Date().toISOString(),
      event: 'pull_request.closed',
      repository: `${context.owner}/${context.repo}`,
      pullNumber: context.pullNumber,
      mergeCommitSha: context.mergeCommitSha,
      provider: process.env.LLM_PROVIDER,
      status,
      filesUpdated: updates.map((u) => u.path),
      error: errorMsg || null,
    }

    await fs.appendFile(absolutePath, JSON.stringify(payload) + '\n', 'utf8')
  } catch (err) {
    // Fail silently so we don't break the webhook if logging fails
    console.error(`[Wisp] Failed to write audit log to ${logPath}:`, err)
  }
}
