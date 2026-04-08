# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Wisp Is

Wisp is a GitHub App that keeps documentation in sync with code changes. When a PR is merged, it fetches the diff, sends it to an LLM, and — if doc updates are needed — opens a "Documentation Sync" PR. It stays silent when no updates are needed.

## Commands

Once implemented, these commands will apply (based on the design spec):

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm test             # Run all tests (Vitest)
npm test -- src/analysis/analyzer.test.ts  # Run a single test file
npm start            # Start the Probot server (PORT default: 3000)
```

## Architecture

Pipeline architecture — each stage is a discrete module:

```
webhook/handler → diff/fetcher → analysis/analyzer (LLM) → pr/creator
```

**`src/webhook/handler.ts`** — Probot entry point. Listens for `pull_request.closed`, guards on `merged === true`, extracts `owner`, `repo`, `pull_number`, `merge_commit_sha`, `default_branch`.

**`src/diff/fetcher.ts`** — Two Octokit calls: PR file diffs + full repo file tree (paths only). Truncates to 50 files if exceeded.

**`src/llm/adapter.ts`** — Provider-agnostic `LLMAdapter` interface (`send(prompt): Promise<string>`). Provider selected at startup via `LLM_PROVIDER`. Implementations in `providers/anthropic.ts` and `providers/openai.ts`.

**`src/analysis/analyzer.ts`** — Builds prompt (system instruction + file tree + diff), calls LLM, parses structured JSON response. Returns empty `updates: []` on LLM failure or malformed JSON (logs warning, never throws).

**`src/pr/creator.ts`** — When updates are non-empty: creates branch `wisp/docs-sync-<sha7>`, commits files with `[Wisp] Update documentation`, opens PR titled `[Wisp] Documentation Sync` targeting the default branch.

## LLM Response Schema

The analyzer instructs the LLM to return:

```json
{
  "updates": [
    { "path": "README.md", "content": "<full file content>", "reason": "..." }
  ]
}
```

## Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| `APP_ID` | Yes | GitHub App ID |
| `PRIVATE_KEY` | Yes | GitHub App private key (PEM) |
| `WEBHOOK_SECRET` | Yes | Webhook signature verification |
| `LLM_PROVIDER` | Yes | `anthropic` or `openai` |
| `ANTHROPIC_API_KEY` | If provider=anthropic | |
| `OPENAI_API_KEY` | If provider=openai | |
| `LLM_MODEL` | No | Override default model |

## Testing Strategy

- Unit tests live at `src/**/*.test.ts`
- Integration test at `test/webhook.test.ts` uses Probot test utilities with mocked LLM and Octokit
- Mock the `LLMAdapter` interface in unit tests, not individual provider implementations
- No E2E tests in v1

## Error Handling Convention

All failures are silent: log the error and return a safe empty result. No retries. Never surface errors to the GitHub user.
