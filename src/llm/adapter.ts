import { AnthropicAdapter } from './providers/anthropic.js'
import { GeminiAdapter } from './providers/gemini.js'
import { OpenAIAdapter } from './providers/openai.js'

export interface LLMAdapter {
  send(prompt: string): Promise<string>
}

const PROVIDERS: Record<string, new () => LLMAdapter> = {
  anthropic: AnthropicAdapter,
  gemini: GeminiAdapter,
  openai: OpenAIAdapter,
}

export function createAdapter(): LLMAdapter {
  const provider = process.env.LLM_PROVIDER?.trim()
  if (!provider) {
    throw new Error(`LLM_PROVIDER must be set to one of: ${Object.keys(PROVIDERS).join(', ')}`)
  }
  const Provider = PROVIDERS[provider]
  if (!Provider) {
    throw new Error(`Unknown LLM_PROVIDER: ${provider}. Must be one of: ${Object.keys(PROVIDERS).join(', ')}`)
  }
  return new Provider()
}
