import type { DiffResult } from '../diff/fetcher.js'

const SYSTEM_INSTRUCTION = `You are Wisp, a documentation sync assistant. Analyze the code diff below and identify documentation files in the repository that need updating.

Return a JSON object with this exact structure:
{
  "updates": [
    { "path": "<file path>", "content": "<complete updated file content>", "reason": "<brief explanation>" }
  ]
}

Rules:
- Only include files that genuinely need updates due to the code changes
- Return the complete new file content, not a diff
- Return { "updates": [] } if no documentation changes are needed
- Only return the JSON object — no markdown fencing, no explanation`

export function buildPrompt(diff: DiffResult): string {
  const fileTree = diff.tree.join('\n')
  const diffContent = diff.files
    .map((f) => `### ${f.filename}\n${f.patch ?? '(binary file)'}`)
    .join('\n\n')
  const truncationNote = diff.truncated
    ? '\n\n> Note: This PR touched more than 50 files. Only the first 50 are shown.\n'
    : ''
  return `${SYSTEM_INSTRUCTION}

## Repository File Tree
\`\`\`
${fileTree}
\`\`\`

## Code Changes${truncationNote}
${diffContent}`
}
