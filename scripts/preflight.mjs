import process from 'node:process'

const MIN_MAJOR = 20
const MIN_MINOR = 19

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

if (import.meta.url === `file://${process.argv[1]}`) {
  assertSupportedNode()
}
