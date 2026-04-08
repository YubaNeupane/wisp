import 'dotenv/config'
import { run } from 'probot'
import app from './app.js'
import { checkLLM } from './llm/adapter.js'

checkLLM()
  .then(() => run(app))
  .catch((err) => {
    console.error(`[Wisp] Startup failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
