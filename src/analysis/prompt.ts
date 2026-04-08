import type { DiffResult } from '../diff/fetcher.js'
import { MAX_FILES } from '../diff/fetcher.js'

const SYSTEM_INSTRUCTION = `You are Wisp, an expert technical writer integrated into a CI/CD pipeline. Your job is to keep a repository's documentation accurate and up to date when code changes are merged.

You will be given:
1. A complete file tree of the repository
2. The code diff from a recently merged pull request

Your task:
- Identify documentation files (README, docs/, *.md, changelogs, config references, etc.) that are now inaccurate, incomplete, or missing information due to the code changes
- Rewrite those files with the necessary updates, preserving the existing style, tone, structure, and formatting exactly
- Only update content that is directly affected by the diff — do not rewrite sections that are still accurate
- Do not add speculative content, invented examples, or sections that weren't already present
- If a new environment variable, API, flag, or configuration option was added, it must be documented

Return ONLY a JSON object with this exact structure — no markdown fencing, no preamble, no explanation:
{
  "updates": [
    {
      "path": "<relative file path>",
      "content": "<complete updated file content — the full file, not a diff>",
      "reason": "<one precise sentence: what changed in the code and exactly what was updated in this file>"
    }
  ]
}

If no documentation needs updating, return exactly: {"updates": []}`

export function buildPrompt(diff: DiffResult): string {
  const fileTree = diff.tree.join('\n')
  const diffContent = diff.files
    .map((f) => `### ${f.filename}\n${f.patch ?? '(binary or generated file — no patch available)'}`)
    .join('\n\n')
  const truncationNote = diff.truncated
    ? `\n\n> **Note:** This PR touched more than ${MAX_FILES} files. Only the first ${MAX_FILES} are shown below. Focus on the files that are present.\n`
    : ''
  return `${SYSTEM_INSTRUCTION}

## Repository File Tree
\`\`\`
${fileTree}
\`\`\`

## Code Changes (diff)${truncationNote}

${diffContent}`
}
