import { createApp } from './src/app.js'
import { config } from './src/config/index.js'
import { closePool } from './src/db/pool.js'

const app = createApp()
await app.listen({ port: config.port, host: '0.0.0.0' })
console.log(`participant portal gateway listening on ${config.port}`)

process.on('SIGTERM', async () => {
  await app.close().catch(() => undefined)
  await closePool().catch(() => undefined)
})
