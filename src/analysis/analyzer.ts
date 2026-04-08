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

function tryParse(raw: string, log: Log): AnalysisResult | null {
  // Strip markdown code fences if the LLM wrapped the JSON (e.g. ```json ... ```)
  const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

  try {
    const parsed = JSON.parse(json) as unknown
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('updates' in parsed) ||
      !Array.isArray((parsed as { updates: unknown }).updates)
    ) {
      log.warn('LLM returned unexpected JSON structure')
      return null
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
    log.warn(`LLM returned non-JSON response: ${json.slice(0, 100)}`)
    return null
  }
}

export async function analyze(
  diff: DiffResult,
  pr: { title: string; body: string | null },
  adapter: LLMAdapter,
  log: Log,
  options?: { customInstructions?: string }
): Promise<AnalysisResult> {
  const prompt = buildPrompt(diff, pr, options?.customInstructions)
  log.info('[Wisp] Sending prompt to LLM...')
  let raw: string
  try {
    raw = await adapter.send(prompt)
  } catch (err) {
    log.error('LLM call failed', err)
    return { updates: [] }
  }
  log.info('[Wisp] LLM responded — parsing result')

  const result = tryParse(raw, log)
  if (result !== null) {
    return result
  }

  // First parse failed — retry once with format feedback
  log.info('[Wisp] LLM response malformed — retrying with format feedback')
  const retryPrompt =
    prompt +
    `\n\n---\n\nIMPORTANT: Your previous response could not be parsed as JSON. You returned:\n\n${raw.slice(0, 300)}\n\nReturn ONLY valid JSON. No markdown fencing. No explanation.`

  let retryRaw: string
  try {
    retryRaw = await adapter.send(retryPrompt)
  } catch (err) {
    log.error('LLM retry call failed', err)
    return { updates: [] }
  }
  log.info('[Wisp] LLM retry responded — parsing result')

  const retryResult = tryParse(retryRaw, log)
  if (retryResult !== null) {
    return retryResult
  }

  return { updates: [] }
}
