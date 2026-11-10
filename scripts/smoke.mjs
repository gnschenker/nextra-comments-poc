import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import process from 'node:process'
import { assertSupportedNode } from './preflight.mjs'

assertSupportedNode()

const port = process.env.PORT ?? '3015'
process.env.PORT = port
process.env.DATABASE_URL ??= 'file:./prisma/dev.db'

const child = spawn(process.execPath, ['scripts/dev.mjs'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env
})

let log = ''
let exited = false
let exitCode = null
let exitSignal = null

child.stdout.on('data', (chunk) => {
  log += chunk.toString()
  process.stdout.write(chunk)
})
child.stderr.on('data', (chunk) => {
  log += chunk.toString()
  process.stderr.write(chunk)
})
child.on('exit', (code, signal) => {
  exited = true
  exitCode = code
  exitSignal = signal
})

function stop() {
  if (!exited && !child.killed) {
    child.kill('SIGTERM')
  }
}

const deadline = Date.now() + 90_000
while (Date.now() < deadline) {
  if (exited) {
    console.error(
      `[nextra-comments] smoke: dev exited before HTTP 200 (code ${exitCode}, signal ${exitSignal})`
    )
    process.exit(1)
  }
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`)
    if (response.ok) {
      const comments = await fetch(`http://127.0.0.1:${port}/api/comments?page=/deploy`)
      console.error(
        `[nextra-comments] smoke: GET / -> ${response.status}, GET /api/comments?page=/deploy -> ${comments.status}`
      )
      if (!comments.ok) {
        stop()
        process.exit(1)
      }
      stop()
      await sleep(500)
      process.exit(0)
    }
  } catch {
    // server not listening yet
  }
  await sleep(500)
}

console.error('[nextra-comments] smoke: timed out waiting for HTTP 200')
if (log.trim()) console.error(log.slice(-4000))
stop()
process.exit(1)
