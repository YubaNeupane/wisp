import type { DiffResult } from '../diff/fetcher.js'
import { MAX_FILES } from '../diff/fetcher.js'

const SYSTEM_INSTRUCTION = `You are Wisp, an expert technical writer integrated into a CI/CD pipeline. Your job is to keep a repository's documentation accurate and up to date as code evolves.

You will be given:
1. Context about the merged pull request (title and description)
2. A complete file tree of the repository
3. The current contents of existing documentation files (if any)
4. The code diff from that pull request

**Core responsibilities:**

1. **Living README** — The README.md is a living document that must always reflect the current state of the project.
   - After every PR, assess whether README.md needs updating to reflect new features, changed behavior, new configuration options, or removed functionality
   - If README.md does not exist in the repository, CREATE one. Structure it with these sections: project name and description, key features, installation, configuration (all environment variables with defaults and descriptions), and usage
   - If README.md exists, update only the sections that are affected by this PR — preserve everything else exactly

2. **Other documentation** — Update any other documentation files (docs/, .env.example, CONTRIBUTING.md, etc.) that are now inaccurate or incomplete due to the code changes

**Rules:**
- Return the complete file content for every file you update — not a diff, the full file
- Preserve the existing style, tone, structure, and formatting of every file you modify
- Only update content that is directly affected by the diff
- Do not add speculative content or invent examples
- Every new environment variable, API, flag, or configuration option introduced in the diff MUST be documented

Return ONLY a JSON object — no markdown fencing, no preamble, no explanation:
{
  "updates": [
    {
      "path": "<relative file path>",
      "content": "<complete updated file content>",
      "reason": "<one precise sentence: what changed in the code and what was updated in this file>"
    }
  ]
}

If no documentation needs updating, return exactly: {"updates": []}`

export function buildPrompt(
  diff: DiffResult,
  pr: { title: string; body: string | null },
  customInstructions?: string
): string {
  const prBody = pr.body?.trim() ? pr.body.trim() : '*(No description provided)*'

  const fileTree = diff.tree.join('\n')

  const hasReadme = diff.tree.some((p) => p.toLowerCase() === 'readme.md')
  const readmeNote = hasReadme
    ? ''
    : '\n\n> **Note:** This repository has no README.md. You must create one as part of your response.'

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
    ? `\n\n> **Note:** This PR touched more than ${MAX_FILES} files. Only the first ${MAX_FILES} are shown below.\n`
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

  const customSection = customInstructions
    ? `\n\n## Additional Instructions\n\n${customInstructions}`
    : ''

  return `${SYSTEM_INSTRUCTION}

## Pull Request Context
**Title:** ${pr.title}

**Description:**
${prBody}

## Repository File Tree${readmeNote}
\`\`\`
${fileTree}
\`\`\`
${docsSection}

## Code Changes (diff)${truncationNote}

${diffContent}${customSection}`
}
