import type { ApplicationFunction } from 'probot'
import { handleMergedPR } from './webhook/handler.js'

const app: ApplicationFunction = (robot) => {
  robot.on('pull_request.closed', async (context) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handleMergedPR(context.octokit as any, context.payload as any, context.log)
  })
}

export default app
