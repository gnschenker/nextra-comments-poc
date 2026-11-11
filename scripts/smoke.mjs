import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import process from 'node:process'
import { assertSupportedNode } from './preflight.mjs'

assertSupportedNode()

const port = process.env.PORT ?? '3015'
process.env.PORT = port
process.env.DATABASE_URL ??= 'file:./prisma/dev.db'
const origin = `http://127.0.0.1:${port}`

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

function fail(message) {
  console.error(`[nextra-comments] smoke: ${message}`)
  if (log.trim()) console.error(log.slice(-4000))
  stop()
  process.exit(1)
}

async function get(path) {
  const response = await fetch(`${origin}${path}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  console.error(`[nextra-comments] smoke: GET ${path} -> ${response.status}`)
  return { response, buffer }
}

async function runChecks() {
  const home = await get('/')
  if (!home.response.ok) fail(`GET / expected 200, got ${home.response.status}`)

  const comments = await get('/api/comments?page=/deploy')
  if (!comments.response.ok) {
    fail(`GET /api/comments?page=/deploy expected 200, got ${comments.response.status}`)
  }

  const favicon = await get('/favicon.ico')
  if (favicon.response.status !== 200) {
    fail(`GET /favicon.ico expected 200, got ${favicon.response.status}`)
  }
  const faviconType = favicon.response.headers.get('content-type') ?? ''
  const faviconText = favicon.buffer.subarray(0, 32).toString('utf8')
  if (faviconType.includes('text/html') || faviconText.includes('<!DOCTYPE')) {
    fail('GET /favicon.ico returned HTML from the MDX catch-all')
  }

  const missing = await get('/this-page-does-not-exist')
  if (missing.response.status !== 404) {
    fail(`GET /this-page-does-not-exist expected 404, got ${missing.response.status}`)
  }

  await sleep(400)
  if (log.includes('Error while loading')) {
    fail('server log contains "Error while loading"')
  }
}

const deadline = Date.now() + 90_000
while (Date.now() < deadline) {
  if (exited) {
    fail(`dev exited before HTTP 200 (code ${exitCode}, signal ${exitSignal})`)
  }
  try {
    const response = await fetch(`${origin}/`)
    if (response.ok) {
      await runChecks()
      stop()
      await sleep(500)
      process.exit(0)
    }
  } catch {
    // server not listening yet
  }
  await sleep(500)
}

fail('timed out waiting for HTTP 200')
