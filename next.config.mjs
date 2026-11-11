import nextra from 'nextra'

const withNextra = nextra({})

export default withNextra({
  // Next 16 defaults to Turbopack and errors if a plugin (Nextra) injects a
  // webpack() config without a turbopack key or an explicit --webpack flag.
  // Nextra 4.5.1 already merges loader rules into this object.
  turbopack: {},
  serverExternalPackages: [
    '@prisma/client',
    '@prisma/adapter-better-sqlite3',
    'better-sqlite3',
    'prisma'
  ]
})
