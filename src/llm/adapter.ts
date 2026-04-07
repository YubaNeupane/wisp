import { AnthropicAdapter } from './providers/anthropic.js'
import { OpenAIAdapter } from './providers/openai.js'

export interface LLMAdapter {
  send(prompt: string): Promise<string>
}

export function createAdapter(): LLMAdapter {
  const provider = process.env.LLM_PROVIDER?.trim()
  if (!provider) throw new Error('LLM_PROVIDER must be set to "anthropic" or "openai"')
  if (provider === 'anthropic') return new AnthropicAdapter()
  if (provider === 'openai') return new OpenAIAdapter()
  throw new Error(`Unknown LLM_PROVIDER: ${provider}`)
}
