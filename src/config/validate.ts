export function validateStartupConfig(): void {
  const required = ['APP_ID', 'PRIVATE_KEY', 'WEBHOOK_SECRET']
  const missing = required.filter((k) => !process.env[k]?.trim())
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}
