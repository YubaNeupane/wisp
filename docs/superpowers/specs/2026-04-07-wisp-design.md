# Wisp — Design Spec

**Date:** 2026-04-07
**Status:** Approved

## Overview

Wisp is a lightweight GitHub App that automatically keeps repository documentation in sync with code changes. When a pull request is merged, Wisp fetches the diff, sends it to an LLM for analysis, and — if documentation updates are needed — opens a "Documentation Sync" PR for human review. It stays silent when no updates are needed.

**Philosophy:** Documentation that follows code like a weightless trail of smoke.

---

## Architecture

Wisp uses a pipeline architecture with discrete, independently testable modules:

```
src/
  index.ts              ← Probot entry point, wires modules together
  webhook/
    handler.ts          ← Listens for pull_request.closed+merged, extracts repo/PR context
  diff/
    fetcher.ts          ← Fetches PR file diffs and repo file tree via Octokit
  llm/
    adapter.ts          ← Provider-agnostic interface: send(prompt) → string
    providers/
      anthropic.ts      ← Claude implementation
      openai.ts         ← OpenAI implementation
  analysis/
    analyzer.ts         ← Builds prompt, calls llm/adapter, parses structured response
    prompt.ts           ← System prompt template
  pr/
    creator.ts          ← Creates branch, commits updated files, opens Wisp PR
```

**Data flow:**

```
webhook/handler
  → diff/fetcher
  → analysis/analyzer (calls llm/adapter)
  → [if updates non-empty] pr/creator
```

---

## Module Details

### webhook/handler

- Registered via Probot: `app.on('pull_request.closed', handler)`
- Guards: only proceeds when `payload.pull_request.merged === true`
- Extracts: `owner`, `repo`, `pull_number`, `merge_commit_sha`, `default_branch`
- Passes context to `diff/fetcher`

### diff/fetcher

Two Octokit calls:
1. `GET /repos/{owner}/{repo}/pulls/{pull_number}/files` — returns changed files with patch content
2. `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1` — returns full repo file tree (paths only)

If the PR touches more than 50 files, truncates to the first 50 and notes this in the prompt.

### llm/adapter

Provider-agnostic interface:

```typescript
interface LLMAdapter {
  send(prompt: string): Promise<string>
}
```

Provider selected at startup via `LLM_PROVIDER` env var. Implementations live in `providers/anthropic.ts` and `providers/openai.ts`. Model overridable via `LLM_MODEL` env var.

### analysis/analyzer

Builds a prompt with three parts:
1. System instruction: Wisp's role + required JSON output schema
2. Repo file tree (paths only, for doc-file awareness)
3. Full diff patch of changed files

Instructs LLM to return:

```json
{
  "updates": [
    { "path": "README.md", "content": "<full file content as a string>", "reason": "..." }
  ]
}
```

Returns empty `updates: []` if no changes needed. Parses and validates the JSON response; on parse failure, logs a warning and returns no updates.

### pr/creator

When `updates` is non-empty:
1. Creates branch: `wisp/docs-sync-<merge_commit_sha_short>` (first 7 chars of SHA)
2. Commits each file in `updates` with message: `[Wisp] Update documentation`
3. Opens PR targeting the repo's default branch (from `payload.repository.default_branch`):
   - Title: `[Wisp] Documentation Sync`
   - Body: lists each updated file and the LLM-provided reason

---

## Configuration

All configuration via environment variables. No config file in v1.

| Variable | Required | Description |
|---|---|---|
| `APP_ID` | Yes | GitHub App ID |
| `PRIVATE_KEY` | Yes | GitHub App private key (PEM) |
| `WEBHOOK_SECRET` | Yes | Webhook payload verification secret |
| `LLM_PROVIDER` | Yes | `anthropic` or `openai` |
| `ANTHROPIC_API_KEY` | If provider=anthropic | Anthropic API key |
| `OPENAI_API_KEY` | If provider=openai | OpenAI API key |
| `LLM_MODEL` | No | Override default model |

Probot handles `PORT` (default: 3000), webhook signature verification, and GitHub App token refresh automatically.

---

## Error Handling

All failures are silent (logged but not surfaced to users):

- LLM call fails → log error, return no updates
- Octokit call fails → log error, abort pipeline
- LLM returns malformed JSON → log warning, return no updates

No retries in v1.

---

## Deployment

- Stateless — each webhook event processed independently, no database
- `Dockerfile` included for containerized deployment
- `.env.example` documents all required variables

---

## Testing

**Runner:** Vitest

**Unit tests** (`src/**/*.test.ts`):
- `analysis/analyzer.test.ts` — mock LLM adapter, assert prompt construction and JSON parsing
- `pr/creator.test.ts` — mock Octokit, assert branch name, commit message, PR title format
- `llm/adapter.test.ts` — assert provider selection by env var

**Integration test** (`test/webhook.test.ts`):
- Uses Probot's test utilities to fire a synthetic `pull_request.closed` event
- LLM and Octokit mocked at this layer
- Asserts full pipeline runs without throwing

No E2E tests in v1.
