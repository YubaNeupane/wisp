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
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string, err?: unknown) => void
}

export async function analyze(
  diff: DiffResult,
  pr: { title: string; body: string | null },
  adapter: LLMAdapter,
  log: Log
): Promise<AnalysisResult> {
  const prompt = buildPrompt(diff, pr)
  log.info('[Wisp] Sending prompt to LLM...')
  let raw: string
  try {
    raw = await adapter.send(prompt)
  } catch (err) {
    log.error('LLM call failed', err)
    return { updates: [] }
  }
  log.info('[Wisp] LLM responded — parsing result')

  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('updates' in parsed) ||
      !Array.isArray((parsed as { updates: unknown }).updates)
    ) {
      log.warn('LLM returned unexpected JSON structure')
      return { updates: [] }
    }

    const rawUpdates = (parsed as { updates: unknown[] }).updates
    const validUpdates: DocUpdate[] = []
    for (const item of rawUpdates) {
      if (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).path === 'string' &&
        typeof (item as Record<string, unknown>).content === 'string' &&
        typeof (item as Record<string, unknown>).reason === 'string'
      ) {
        validUpdates.push(item as DocUpdate)
      } else {
        log.warn('LLM returned malformed DocUpdate item, skipping')
      }
    }
    return { updates: validUpdates }
  } catch {
    log.warn(`LLM returned non-JSON response: ${raw.slice(0, 100)}`)
    return { updates: [] }
  }
}
