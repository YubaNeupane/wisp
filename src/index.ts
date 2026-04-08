import 'dotenv/config'
import { run } from 'probot'
import app from './app.js'
import { checkLLM } from './llm/adapter.js'
import { validateStartupConfig } from './config/validate.js'

try {
  validateStartupConfig()
} catch (err) {
  console.error(`[Wisp] Startup failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}

checkLLM()
  .then(() => run(app))
  .catch((err) => {
    console.error(`[Wisp] Startup failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
