import { spawn } from 'node:child_process'
import process from 'node:process'
import { assertSupportedNode } from './preflight.mjs'

assertSupportedNode()

process.env.DATABASE_URL ??= 'file:./prisma/dev.db'

function run(command, args, { inherit = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      env: process.env
    })
    if (!inherit) {
      child.stdout.pipe(process.stdout)
      child.stderr.pipe(process.stderr)
    }
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} ${args.join(' ')} killed by ${signal}`))
        return
      }
      resolve(code ?? 1)
    })
  })
}

const migrateCode = await run('npx', ['prisma', 'migrate', 'deploy'], { inherit: true })
if (migrateCode !== 0) {
  console.error(`[nextra-comments] prisma migrate deploy exited ${migrateCode}`)
  process.exit(migrateCode)
}

const nextArgs = ['next', 'dev', ...process.argv.slice(2)]
const child = spawn('npx', nextArgs, {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env
})

let ready = false
let log = ''

function onChunk(chunk, write) {
  const text = chunk.toString()
  log += text
  write(chunk)
  if (/Ready in/i.test(text) || /Local:\s+http/i.test(text)) {
    ready = true
  }
}

child.stdout.on('data', (chunk) => onChunk(chunk, (c) => process.stdout.write(c)))
child.stderr.on('data', (chunk) => onChunk(chunk, (c) => process.stderr.write(c)))
child.on('error', (error) => {
  console.error('[nextra-comments] failed to start next dev:', error)
  process.exit(1)
})

function shutdown(signal) {
  if (!child.killed) child.kill(signal)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

child.on('exit', (code, signal) => {
  const reason = signal ? `signal ${signal}` : `code ${code}`
  if (!ready) {
    console.error(
      `[nextra-comments] next dev exited before Ready (${reason}). Treating a silent or early exit as failure.`
    )
    if (log.trim()) {
      console.error('[nextra-comments] last output:')
      console.error(log.slice(-4000))
    }
    process.exit(1)
  }
  if (signal) {
    console.error(`[nextra-comments] next dev stopped (${reason})`)
    process.exit(1)
  }
  if (code !== 0) {
    console.error(`[nextra-comments] next dev exited ${code}`)
  }
  process.exit(code ?? 1)
})
