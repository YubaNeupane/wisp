# Project Name

## Description
Wisp is a GitHub App that keeps documentation in sync with code changes. It updates affected documentation when code changes are made, ensuring that documents are always in line with the current state of the code.

## Key Features
- Automatic documentation updates on code changes
- Supports multiple LLM providers (Anthropic, OpenAI, Groq)
- Flexible configuration options
- Configuration file support for behavior customization
- Provides real-time feedback on documentation sync status via GitHub Check Runs
- Supports applying documentation updates directly via chatops commands

## Installation
```bash
npm install
```

## Configuration
| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | If provider=anthropic | API key for Anthropic |
| `APP_ID` | Yes | GitHub App ID |
| `GROQ_API_KEY` | If provider=groq | API key for Groq |
| `LLM_MODEL` | No | Override default model |
| `LLM_PROVIDER` | Yes | `anthropic` or `openai` |
| `OPENAI_API_KEY` | If provider=openai | API key for OpenAI |
| `PRIVATE_KEY` | Yes | GitHub App private key (PEM) |
| `WEBHOOK_SECRET` | Yes | Webhook signature verification |
| `WISP_AUDIT_LOG` | No | Enable audit logging (default: false) |
| `WISP_AUDIT_LOG_PATH` | No | File path for audit logs (default: .wisp/audit.log) |

## Wisp Configuration File (`.wisp.yaml`)
Wisp can be configured using a `.wisp.yaml` file in the repository's root. This file controls various aspects of Wisp's behavior.

| Option | Description | Default |
|---|---|---|
| `mode` | Determines how Wisp posts documentation suggestions. `pr` creates a new pull request with suggested changes, while `comment` posts them as inline comments on the original pull request. | `pr` |

## Usage
```bash
npm start            # Start the Probot server (PORT default: 3000)
npm test             # Run all tests (Vitest)
npm test -- src/analysis/analyzer.test.ts  # Run a single test file
```

### ChatOps Commands
Wisp supports interactive commands via GitHub comments on Pull Requests:

- **`@wisp apply`**: When Wisp has posted documentation suggestions on a Pull Request (either as a new PR or as an inline comment), you can comment `@wisp apply` on that PR to instruct Wisp to commit the latest suggested updates directly to the repository's default branch (e.g., `main` or `master`). This provides a quick way to accept and integrate Wisp's proposals.
