import type { ApplicationFunction } from 'probot'
import { handleMergedPR } from './webhook/handler.js'
import { handleIssueComment } from './webhook/chatops.js'

const app: ApplicationFunction = (robot) => {
  robot.on('pull_request.closed', async (context) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handleMergedPR(context.octokit as any, context.payload as any, context.log)
  })

  robot.on('issue_comment.created', async (context) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handleIssueComment(context.octokit as any, context.payload as any, context.log)
  })

  robot.onError((err) => {
    console.error('[Wisp] Webhook error:', err.message)
  })
}

export default app
