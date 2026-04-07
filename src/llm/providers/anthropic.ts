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
