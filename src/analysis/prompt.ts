import type { DiffResult } from '../diff/fetcher.js'
import { MAX_FILES } from '../diff/fetcher.js'

const SYSTEM_INSTRUCTION = `You are Wisp, an expert technical writer integrated into a CI/CD pipeline. Your job is to keep a repository's documentation accurate and up to date when code changes are merged.

You will be given:
1. Context about the merged pull request (title and description)
2. A complete file tree of the repository
3. The code diff from that pull request

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

export function buildPrompt(
  diff: DiffResult,
  pr: { title: string; body: string | null }
): string {
  const prBody = pr.body?.trim() ? pr.body.trim() : '*(No description provided)*'

  const fileTree = diff.tree.join('\n')

  const diffContent = diff.files
    .map((f) => {
      const statusBadge = f.status !== 'modified' ? ` [${f.status}]` : ''
      const header = f.previous_filename
        ? `### ${f.previous_filename} → ${f.filename}${statusBadge}`
        : `### ${f.filename}${statusBadge}`
      return `${header}\n${f.patch ?? '(binary or generated file — no patch available)'}`
    })
    .join('\n\n')

  const truncationNote = diff.truncated
    ? `\n\n> **Note:** This PR touched more than ${MAX_FILES} files. Only the first ${MAX_FILES} are shown below. Focus on the files that are present.\n`
    : ''

  const docsSection =
    diff.docs.length > 0
      ? `\n\n## Current Documentation Files\n\nThese are the current contents of documentation files. You MUST treat these as the base — preserve all existing content and only add or modify what the code changes require.\n\n` +
        diff.docs
          .map((d) => {
            const note = d.truncated ? '\n\n*(file truncated for length)*' : ''
            return `### ${d.path}\n\`\`\`\n${d.content}${note}\n\`\`\``
          })
          .join('\n\n')
      : ''

  return `${SYSTEM_INSTRUCTION}

## Pull Request Context
**Title:** ${pr.title}

**Description:**
${prBody}

## Repository File Tree
\`\`\`
${fileTree}
\`\`\`
${docsSection}

## Code Changes (diff)${truncationNote}

${diffContent}`
}
