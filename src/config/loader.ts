import yaml from 'js-yaml'
import type { Octokit } from '@octokit/core'
import type { PullContext } from '../diff/fetcher.js'

export interface WispConfig {
  mode?: 'pr' | 'comment'           // default: 'pr'
  docs?: {
    focus?: string[]                  // only touch these paths/prefixes
    ignore?: string[]                 // never touch these paths/prefixes
  }
  ignore_authors?: string[]           // skip PRs from these authors (merged with built-in bots)
  ignore_labels?: string[]            // skip PRs with any of these labels
  instructions?: string               // extra text appended to the LLM system instruction
  pr?: {
    draft?: boolean                   // open docs PR as draft (default: false)
  }
}

export async function loadConfig(octokit: Octokit, context: PullContext): Promise<WispConfig> {
  try {
    const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner: context.owner,
      repo: context.repo,
      path: '.wisp.yml',
      ref: context.defaultBranch,
    })
    const data = response.data as { content: string; encoding: string }
    const raw = Buffer.from(data.content, 'base64').toString('utf8')
    const parsed = yaml.load(raw)
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as WispConfig
    }
    return {}
  } catch {
    return {}
  }
}
