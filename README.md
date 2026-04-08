# Project Name

## Description
Wisp is a GitHub App that keeps documentation in sync with code changes. It updates affected documentation when code changes are made, ensuring that documents are always in line with the current state of the code.

## Key Features
- Automatic documentation updates on code changes
- Supports multiple LLM providers (Anthropic, OpenAI, Groq)
- Flexible configuration options
- Configuration file support for behavior customization
- Provides real-time feedback on documentation sync status via GitHub Check Runs

## Installation
```bash
npm install
```

## Configuration
| Variable | Required | Description |
|---|---|---|
| `APP_ID` | Yes | GitHub App ID |
| `PRIVATE_KEY` | Yes | GitHub App private key (PEM) |
| `WEBHOOK_SECRET` | Yes | Webhook signature verification |
| `LLM_PROVIDER` | Yes | `anthropic` or `openai` |
| `ANTHROPIC_API_KEY` | If provider=anthropic | API key for Anthropic |
| `OPENAI_API_KEY` | If provider=openai | API key for OpenAI |
| `GROQ_API_KEY` | If provider=groq | API key for Groq |
| `LLM_MODEL` | No | Override default model |
| `WISP_AUDIT_LOG` | No | Enable audit logging (default: false) |
| `WISP_AUDIT_LOG_PATH` | No | File path for audit logs (default: .wisp/audit.log) |

## Usage
```bash
npm start            # Start the Probot server (PORT default: 3000)
npm test             # Run all tests (Vitest)
npm test -- src/analysis/analyzer.test.ts  # Run a single test file
```
