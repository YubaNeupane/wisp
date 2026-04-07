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
