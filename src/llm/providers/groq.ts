import OpenAI from 'openai'
import type { LLMAdapter } from '../adapter.js'

const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

export class GroqAdapter implements LLMAdapter {
  private client: OpenAI

  constructor() {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY must be set when LLM_PROVIDER=groq')
    this.client = new OpenAI({ 
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1'
    })
  }

  async send(prompt: string): Promise<string> {
    const model = process.env.LLM_MODEL || DEFAULT_MODEL
    const response = await this.client.chat.completions.create({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })
    const content = response.choices[0]?.message.content
    if (!content) throw new Error('Empty response from Groq')
    return content
  }
}
