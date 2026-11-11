import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const MIN_MAJOR = 20
const MIN_MINOR = 19
const PINNED_NEXT = '15.5.29'

export function assertSupportedNode() {
  const { version, node } = { version: process.version, node: process.versions.node }
  const [major, minor] = node.split('.').map((part) => Number(part))
  if (major < MIN_MAJOR || (major === MIN_MAJOR && minor < MIN_MINOR)) {
    console.error(
      `[nextra-comments] Node.js ${version} is too old. Prisma ORM 7 needs Node.js >= ${MIN_MAJOR}.${MIN_MINOR}.0.`
    )
    process.exit(1)
  }
  console.error(
    `[nextra-comments] Node.js ${version} ${process.platform} ${process.arch}`
  )
  if (major >= 26) {
    console.error(
      '[nextra-comments] Node.js 26 is in this project CI matrix. Next.js 15.5.29 engines include >=20. If next exits after "Starting..." without "Ready", this wrapper treats that as failure.'
    )
  }
}

export function assertPinnedNext() {
  const file = path.join(process.cwd(), 'node_modules', 'next', 'package.json')
  if (!fs.existsSync(file)) {
    console.error(
      '[nextra-comments] next is not in node_modules. Run npm ci. Do not run npx next@latest.'
    )
    process.exit(1)
  }
  const { version } = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (version !== PINNED_NEXT) {
    console.error(
      `[nextra-comments] next must be exactly ${PINNED_NEXT}. Found ${version}.`
    )
    process.exit(1)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  assertSupportedNode()
  assertPinnedNext()
}
