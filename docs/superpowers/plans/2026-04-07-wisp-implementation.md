# Wisp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Probot GitHub App that watches merged PRs, uses an LLM to detect needed documentation updates, and opens "Documentation Sync" PRs automatically.

**Architecture:** Pipeline of discrete, independently testable modules: webhook handler → diff fetcher → LLM analyzer → PR creator. The merged-PR guard lives in the handler. The app entry point only does Probot wiring.

**Tech Stack:** Node.js 22, TypeScript 5 (ESM/Node16), Probot 13, @anthropic-ai/sdk, openai, Vitest 2, @octokit/core (types).

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `Dockerfile`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "wisp",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.36.0",
    "openai": "^4.77.0",
    "probot": "^13.3.0"
  },
  "devDependencies": {
    "@octokit/core": "^6.0.0",
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  },
  "engines": {
    "node": ">=22"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
})
```

- [ ] **Step 4: Create .env.example**

```
APP_ID=
PRIVATE_KEY=
WEBHOOK_SECRET=
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
LLM_MODEL=
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
.env
*.pem
```

- [ ] **Step 6: Create Dockerfile**

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist/ ./dist/
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

- [ ] **Step 7: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created with no errors

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .env.example .gitignore Dockerfile
git commit -m "chore: project scaffolding"
```

---

### Task 2: LLM Adapter

**Files:**
- Create: `src/llm/adapter.ts`
- Create: `src/llm/providers/anthropic.ts`
- Create: `src/llm/providers/openai.ts`
- Test: `src/llm/adapter.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/llm/adapter.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAdapter } from './adapter.js'

describe('createAdapter', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  it('throws when LLM_PROVIDER is not set', () => {
    vi.stubEnv('LLM_PROVIDER', '')
    expect(() => createAdapter()).toThrow('LLM_PROVIDER must be set')
  })

  it('returns an adapter with a send method when LLM_PROVIDER=anthropic', () => {
    vi.stubEnv('LLM_PROVIDER', 'anthropic')
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    const adapter = createAdapter()
    expect(typeof adapter.send).toBe('function')
  })

  it('returns an adapter with a send method when LLM_PROVIDER=openai', () => {
    vi.stubEnv('LLM_PROVIDER', 'openai')
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    const adapter = createAdapter()
    expect(typeof adapter.send).toBe('function')
  })

  it('throws for unknown provider', () => {
    vi.stubEnv('LLM_PROVIDER', 'gemini')
    expect(() => createAdapter()).toThrow('Unknown LLM_PROVIDER: gemini')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/llm/adapter.test.ts`
Expected: FAIL — "Cannot find module './adapter.js'"

- [ ] **Step 3: Create src/llm/providers/anthropic.ts**

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { LLMAdapter } from '../adapter.js'

const DEFAULT_MODEL = 'claude-opus-4-6'

export class AnthropicAdapter implements LLMAdapter {
  private client: Anthropic

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  async send(prompt: string): Promise<string> {
    const model = process.env.LLM_MODEL ?? DEFAULT_MODEL
    const message = await this.client.messages.create({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })
    const block = message.content[0]
    if (block.type !== 'text') throw new Error('Unexpected response type from Anthropic')
    return block.text
  }
}
```

- [ ] **Step 4: Create src/llm/providers/openai.ts**

```typescript
import OpenAI from 'openai'
import type { LLMAdapter } from '../adapter.js'

const DEFAULT_MODEL = 'gpt-4o'

export class OpenAIAdapter implements LLMAdapter {
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }

  async send(prompt: string): Promise<string> {
    const model = process.env.LLM_MODEL ?? DEFAULT_MODEL
    const response = await this.client.chat.completions.create({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })
    const content = response.choices[0]?.message.content
    if (!content) throw new Error('Empty response from OpenAI')
    return content
  }
}
```

- [ ] **Step 5: Create src/llm/adapter.ts**

```typescript
import { AnthropicAdapter } from './providers/anthropic.js'
import { OpenAIAdapter } from './providers/openai.js'

export interface LLMAdapter {
  send(prompt: string): Promise<string>
}

export function createAdapter(): LLMAdapter {
  const provider = process.env.LLM_PROVIDER
  if (!provider) throw new Error('LLM_PROVIDER must be set to "anthropic" or "openai"')
  if (provider === 'anthropic') return new AnthropicAdapter()
  if (provider === 'openai') return new OpenAIAdapter()
  throw new Error(`Unknown LLM_PROVIDER: ${provider}`)
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/llm/adapter.test.ts`
Expected: PASS — 4 tests passing

- [ ] **Step 7: Commit**

```bash
git add src/llm/
git commit -m "feat: add provider-agnostic LLM adapter with Anthropic and OpenAI implementations"
```

---

### Task 3: Diff Fetcher

**Files:**
- Create: `src/diff/fetcher.ts`

- [ ] **Step 1: Create src/diff/fetcher.ts**

```typescript
import type { Octokit } from '@octokit/core'

export interface FileDiff {
  filename: string
  patch?: string
}

export interface DiffResult {
  files: FileDiff[]
  tree: string[]
  truncated: boolean
}

export interface PullContext {
  owner: string
  repo: string
  pullNumber: number
  mergeCommitSha: string
  defaultBranch: string
}

const MAX_FILES = 50

export async function fetchDiff(octokit: Octokit, context: PullContext): Promise<DiffResult> {
  const [filesResponse, treeResponse] = await Promise.all([
    octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
      owner: context.owner,
      repo: context.repo,
      pull_number: context.pullNumber,
    }),
    octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
      owner: context.owner,
      repo: context.repo,
      tree_sha: context.mergeCommitSha,
      recursive: '1',
    }),
  ])

  const allFiles = filesResponse.data as FileDiff[]
  const truncated = allFiles.length > MAX_FILES
  const files = truncated ? allFiles.slice(0, MAX_FILES) : allFiles

  const tree = (treeResponse.data.tree as { path?: string }[])
    .map((item) => item.path)
    .filter((p): p is string => Boolean(p))

  return { files, tree, truncated }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/diff/
git commit -m "feat: add diff fetcher for PR file diffs and repo file tree"
```

---

### Task 4: Prompt Template and Analyzer

**Files:**
- Create: `src/analysis/prompt.ts`
- Create: `src/analysis/analyzer.ts`
- Test: `src/analysis/analyzer.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/analysis/analyzer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LLMAdapter } from '../llm/adapter.js'
import type { DiffResult } from '../diff/fetcher.js'

const mockDiff: DiffResult = {
  files: [{ filename: 'src/auth.ts', patch: '@@ -1,3 +1,5 @@\n+export function login() {}' }],
  tree: ['README.md', 'docs/api.md', 'src/auth.ts'],
  truncated: false,
}

const mockLog = { warn: vi.fn(), error: vi.fn() }

describe('analyze', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns updates from a valid LLM response', async () => {
    const { analyze } = await import('./analyzer.js')
    const adapter: LLMAdapter = {
      send: vi.fn().mockResolvedValue(
        JSON.stringify({
          updates: [{ path: 'README.md', content: '# Updated README', reason: 'Added login section' }],
        })
      ),
    }
    const result = await analyze(mockDiff, adapter, mockLog)
    expect(result.updates).toHaveLength(1)
    expect(result.updates[0].path).toBe('README.md')
    expect(result.updates[0].content).toBe('# Updated README')
  })

  it('returns empty updates when LLM returns no changes needed', async () => {
    const { analyze } = await import('./analyzer.js')
    const adapter: LLMAdapter = {
      send: vi.fn().mockResolvedValue(JSON.stringify({ updates: [] })),
    }
    const result = await analyze(mockDiff, adapter, mockLog)
    expect(result.updates).toHaveLength(0)
  })

  it('returns empty updates and warns on malformed JSON', async () => {
    const { analyze } = await import('./analyzer.js')
    const adapter: LLMAdapter = {
      send: vi.fn().mockResolvedValue('Sure! Here are my suggestions: ...'),
    }
    const result = await analyze(mockDiff, adapter, mockLog)
    expect(result.updates).toHaveLength(0)
    expect(mockLog.warn).toHaveBeenCalled()
  })

  it('returns empty updates and logs error when LLM throws', async () => {
    const { analyze } = await import('./analyzer.js')
    const adapter: LLMAdapter = {
      send: vi.fn().mockRejectedValue(new Error('Network timeout')),
    }
    const result = await analyze(mockDiff, adapter, mockLog)
    expect(result.updates).toHaveLength(0)
    expect(mockLog.error).toHaveBeenCalled()
  })

  it('includes the file tree and diff patch in the prompt', async () => {
    const { analyze } = await import('./analyzer.js')
    const adapter: LLMAdapter = {
      send: vi.fn().mockResolvedValue(JSON.stringify({ updates: [] })),
    }
    await analyze(mockDiff, adapter, mockLog)
    const prompt = (adapter.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prompt).toContain('README.md')
    expect(prompt).toContain('src/auth.ts')
    expect(prompt).toContain('login')
  })

  it('notes truncation in the prompt when diff was truncated', async () => {
    const { analyze } = await import('./analyzer.js')
    const truncatedDiff: DiffResult = { ...mockDiff, truncated: true }
    const adapter: LLMAdapter = {
      send: vi.fn().mockResolvedValue(JSON.stringify({ updates: [] })),
    }
    await analyze(truncatedDiff, adapter, mockLog)
    const prompt = (adapter.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prompt).toContain('50')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/analysis/analyzer.test.ts`
Expected: FAIL — "Cannot find module './analyzer.js'"

- [ ] **Step 3: Create src/analysis/prompt.ts**

```typescript
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
```

- [ ] **Step 4: Create src/analysis/analyzer.ts**

```typescript
import type { LLMAdapter } from '../llm/adapter.js'
import type { DiffResult } from '../diff/fetcher.js'
import { buildPrompt } from './prompt.js'

export interface DocUpdate {
  path: string
  content: string
  reason: string
}

export interface AnalysisResult {
  updates: DocUpdate[]
}

type Log = {
  warn: (msg: string) => void
  error: (msg: string, err?: unknown) => void
}

export async function analyze(
  diff: DiffResult,
  adapter: LLMAdapter,
  log: Log
): Promise<AnalysisResult> {
  const prompt = buildPrompt(diff)
  let raw: string
  try {
    raw = await adapter.send(prompt)
  } catch (err) {
    log.error('LLM call failed', err)
    return { updates: [] }
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'updates' in parsed &&
      Array.isArray((parsed as { updates: unknown }).updates)
    ) {
      return parsed as AnalysisResult
    }
    log.warn('LLM returned unexpected JSON structure')
    return { updates: [] }
  } catch {
    log.warn(`LLM returned non-JSON response: ${raw.slice(0, 100)}`)
    return { updates: [] }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/analysis/analyzer.test.ts`
Expected: PASS — 6 tests passing

- [ ] **Step 6: Commit**

```bash
git add src/analysis/
git commit -m "feat: add LLM prompt builder and analyzer with structured JSON response parsing"
```

---

### Task 5: PR Creator

**Files:**
- Create: `src/pr/creator.ts`
- Test: `src/pr/creator.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/pr/creator.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createDocSyncPR } from './creator.js'
import type { PullContext } from '../diff/fetcher.js'
import type { DocUpdate } from '../analysis/analyzer.js'

const mockContext: PullContext = {
  owner: 'acme',
  repo: 'app',
  pullNumber: 42,
  mergeCommitSha: 'abc1234def5678',
  defaultBranch: 'main',
}

const mockUpdates: DocUpdate[] = [
  { path: 'README.md', content: '# Updated README', reason: 'Added login section' },
]

const mockLog = { info: vi.fn(), error: vi.fn() }

function makeMockOctokit(existingFileSha?: string) {
  return {
    request: vi.fn().mockImplementation((route: string) => {
      if (route === 'GET /repos/{owner}/{repo}/git/ref/{ref}') {
        return Promise.resolve({ data: { object: { sha: 'base-sha-000' } } })
      }
      if (route === 'POST /repos/{owner}/{repo}/git/refs') {
        return Promise.resolve({})
      }
      if (route === 'GET /repos/{owner}/{repo}/contents/{path}') {
        if (existingFileSha) return Promise.resolve({ data: { sha: existingFileSha } })
        return Promise.reject(new Error('Not Found'))
      }
      if (route === 'PUT /repos/{owner}/{repo}/contents/{path}') {
        return Promise.resolve({})
      }
      if (route === 'POST /repos/{owner}/{repo}/pulls') {
        return Promise.resolve({})
      }
      return Promise.resolve({})
    }),
  }
}

describe('createDocSyncPR', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a branch named wisp/docs-sync-<first 7 chars of sha>', async () => {
    const octokit = makeMockOctokit()
    await createDocSyncPR(octokit as any, mockContext, mockUpdates, mockLog)
    const refCall = (octokit.request as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'POST /repos/{owner}/{repo}/git/refs'
    )
    expect(refCall?.[1].ref).toBe('refs/heads/wisp/docs-sync-abc1234')
  })

  it('commits each file with message "[Wisp] Update documentation"', async () => {
    const octokit = makeMockOctokit()
    await createDocSyncPR(octokit as any, mockContext, mockUpdates, mockLog)
    const putCall = (octokit.request as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'PUT /repos/{owner}/{repo}/contents/{path}'
    )
    expect(putCall?.[1].message).toBe('[Wisp] Update documentation')
    expect(putCall?.[1].path).toBe('README.md')
  })

  it('opens a PR with title "[Wisp] Documentation Sync" targeting the default branch', async () => {
    const octokit = makeMockOctokit()
    await createDocSyncPR(octokit as any, mockContext, mockUpdates, mockLog)
    const prCall = (octokit.request as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'POST /repos/{owner}/{repo}/pulls'
    )
    expect(prCall?.[1].title).toBe('[Wisp] Documentation Sync')
    expect(prCall?.[1].base).toBe('main')
    expect(prCall?.[1].head).toBe('wisp/docs-sync-abc1234')
  })

  it('includes the file SHA when updating an existing file', async () => {
    const octokit = makeMockOctokit('existing-file-sha')
    await createDocSyncPR(octokit as any, mockContext, mockUpdates, mockLog)
    const putCall = (octokit.request as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'PUT /repos/{owner}/{repo}/contents/{path}'
    )
    expect(putCall?.[1].sha).toBe('existing-file-sha')
  })

  it('omits SHA when creating a new file', async () => {
    const octokit = makeMockOctokit()
    await createDocSyncPR(octokit as any, mockContext, mockUpdates, mockLog)
    const putCall = (octokit.request as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'PUT /repos/{owner}/{repo}/contents/{path}'
    )
    expect(putCall?.[1].sha).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pr/creator.test.ts`
Expected: FAIL — "Cannot find module './creator.js'"

- [ ] **Step 3: Create src/pr/creator.ts**

```typescript
import type { Octokit } from '@octokit/core'
import type { PullContext } from '../diff/fetcher.js'
import type { DocUpdate } from '../analysis/analyzer.js'

type Log = {
  info: (msg: string) => void
  error: (msg: string, err?: unknown) => void
}

export async function createDocSyncPR(
  octokit: Octokit,
  context: PullContext,
  updates: DocUpdate[],
  log: Log
): Promise<void> {
  const { owner, repo, defaultBranch, mergeCommitSha } = context
  const branchName = `wisp/docs-sync-${mergeCommitSha.slice(0, 7)}`

  const refResponse = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  })
  const baseSha = (refResponse.data as { object: { sha: string } }).object.sha

  await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  })

  for (const update of updates) {
    const encoded = Buffer.from(update.content).toString('base64')
    let fileSha: string | undefined

    try {
      const existing = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner,
        repo,
        path: update.path,
        ref: branchName,
      })
      fileSha = (existing.data as { sha: string }).sha
    } catch {
      // File does not exist yet — no SHA needed for creation
    }

    await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner,
      repo,
      path: update.path,
      message: '[Wisp] Update documentation',
      content: encoded,
      branch: branchName,
      ...(fileSha !== undefined ? { sha: fileSha } : {}),
    })
  }

  const body =
    `This PR was automatically opened by Wisp to keep documentation in sync.\n\n` +
    `## Updated Files\n\n` +
    updates.map((u) => `- **${u.path}**: ${u.reason}`).join('\n')

  await octokit.request('POST /repos/{owner}/{repo}/pulls', {
    owner,
    repo,
    title: '[Wisp] Documentation Sync',
    body,
    head: branchName,
    base: defaultBranch,
  })

  log.info(`[Wisp] Opened documentation sync PR: ${branchName}`)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pr/creator.test.ts`
Expected: PASS — 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/pr/
git commit -m "feat: add PR creator that branches, commits doc updates, and opens sync PRs"
```

---

### Task 6: Webhook Handler

**Files:**
- Create: `src/webhook/handler.ts`

- [ ] **Step 1: Create src/webhook/handler.ts**

```typescript
import type { Octokit } from '@octokit/core'
import { fetchDiff, type PullContext } from '../diff/fetcher.js'
import { analyze } from '../analysis/analyzer.js'
import { createDocSyncPR } from '../pr/creator.js'
import { createAdapter } from '../llm/adapter.js'

type Log = {
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string, err?: unknown) => void
}

type MergedPRPayload = {
  pull_request: {
    merged: boolean
    number: number
    merge_commit_sha: string
  }
  repository: {
    owner: { login: string }
    name: string
    default_branch: string
  }
}

export async function handleMergedPR(
  octokit: Octokit,
  payload: MergedPRPayload,
  log: Log
): Promise<void> {
  if (!payload.pull_request.merged) return

  const context: PullContext = {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    pullNumber: payload.pull_request.number,
    mergeCommitSha: payload.pull_request.merge_commit_sha,
    defaultBranch: payload.repository.default_branch,
  }

  let diff
  try {
    diff = await fetchDiff(octokit, context)
  } catch (err) {
    log.error('Failed to fetch diff', err)
    return
  }

  const adapter = createAdapter()
  const { updates } = await analyze(diff, adapter, log)

  if (updates.length === 0) {
    log.info(`[Wisp] No documentation updates needed for PR #${context.pullNumber}`)
    return
  }

  try {
    await createDocSyncPR(octokit, context, updates, log)
  } catch (err) {
    log.error('Failed to create documentation sync PR', err)
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/webhook/
git commit -m "feat: add webhook handler that orchestrates the documentation sync pipeline"
```

---

### Task 7: App Entry Point and Integration Test

**Files:**
- Create: `src/app.ts`
- Create: `src/index.ts`
- Test: `test/webhook.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `test/webhook.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Control the LLM response per test via this variable
let mockLLMResponse = JSON.stringify({
  updates: [{ path: 'README.md', content: '# Updated', reason: 'login added' }],
})

vi.mock('../src/diff/fetcher.js', () => ({
  fetchDiff: vi.fn().mockResolvedValue({
    files: [{ filename: 'src/auth.ts', patch: '@@ -1 +1 @@\n+export function login() {}' }],
    tree: ['README.md', 'src/auth.ts'],
    truncated: false,
  }),
}))

vi.mock('../src/llm/adapter.js', () => ({
  createAdapter: vi.fn(() => ({
    send: vi.fn(() => Promise.resolve(mockLLMResponse)),
  })),
}))

const mockCreateDocSyncPR = vi.fn().mockResolvedValue(undefined)
vi.mock('../src/pr/creator.js', () => ({
  createDocSyncPR: mockCreateDocSyncPR,
}))

import { handleMergedPR } from '../src/webhook/handler.js'

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const mockOctokit = {} as any

const mergedPayload = {
  pull_request: { merged: true, number: 1, merge_commit_sha: 'abc123def456' },
  repository: { owner: { login: 'acme' }, name: 'app', default_branch: 'main' },
}

describe('integration: documentation sync pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLLMResponse = JSON.stringify({
      updates: [{ path: 'README.md', content: '# Updated', reason: 'login added' }],
    })
  })

  it('runs the full pipeline without throwing', async () => {
    await expect(handleMergedPR(mockOctokit, mergedPayload, mockLog)).resolves.not.toThrow()
  })

  it('calls createDocSyncPR with the right arguments when LLM returns updates', async () => {
    await handleMergedPR(mockOctokit, mergedPayload, mockLog)
    expect(mockCreateDocSyncPR).toHaveBeenCalledOnce()
    expect(mockCreateDocSyncPR).toHaveBeenCalledWith(
      mockOctokit,
      expect.objectContaining({ owner: 'acme', repo: 'app', pullNumber: 1 }),
      expect.arrayContaining([expect.objectContaining({ path: 'README.md' })]),
      mockLog
    )
  })

  it('skips createDocSyncPR when LLM returns no updates', async () => {
    mockLLMResponse = JSON.stringify({ updates: [] })
    await handleMergedPR(mockOctokit, mergedPayload, mockLog)
    expect(mockCreateDocSyncPR).not.toHaveBeenCalled()
  })

  it('skips the pipeline for unmerged PRs', async () => {
    const unmergedPayload = {
      ...mergedPayload,
      pull_request: { ...mergedPayload.pull_request, merged: false },
    }
    await handleMergedPR(mockOctokit, unmergedPayload, mockLog)
    expect(mockCreateDocSyncPR).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/webhook.test.ts`
Expected: FAIL — module import errors (src/app.ts doesn't exist yet, or handler can't be loaded)

- [ ] **Step 3: Create src/app.ts**

```typescript
import type { ApplicationFunction } from 'probot'
import { handleMergedPR } from './webhook/handler.js'

const app: ApplicationFunction = (robot) => {
  robot.on('pull_request.closed', async (context) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handleMergedPR(context.octokit as any, context.payload as any, context.log)
  })
}

export default app
```

- [ ] **Step 4: Create src/index.ts**

```typescript
import { run } from 'probot'
import app from './app.js'

run(app)
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: PASS — all tests passing across adapter, analyzer, creator, and integration test files

- [ ] **Step 6: Build to verify TypeScript compiles cleanly**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Final commit**

```bash
git add src/app.ts src/index.ts test/
git commit -m "feat: add Probot app entry point and integration tests for the full pipeline"
```
