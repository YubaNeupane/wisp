import { GoogleGenerativeAI } from '@google/generative-ai'
import type { LLMAdapter } from '../adapter.js'

const DEFAULT_MODEL = 'gemini-2.0-flash'

export class GeminiAdapter implements LLMAdapter {
  private client: GoogleGenerativeAI

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY must be set when LLM_PROVIDER=gemini')
    this.client = new GoogleGenerativeAI(apiKey)
  }

  async send(prompt: string): Promise<string> {
    const model = this.client.getGenerativeModel({
      model: process.env.LLM_MODEL || DEFAULT_MODEL,
    })
    const result = await model.generateContent(prompt)
    const text = result.response.text()
    if (!text) throw new Error('Empty response from Gemini')
    return text
  }
}
