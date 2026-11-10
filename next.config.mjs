import nextra from 'nextra'

const withNextra = nextra({})

export default withNextra({
  serverExternalPackages: [
    '@prisma/client',
    '@prisma/adapter-better-sqlite3',
    'better-sqlite3',
    'prisma'
  ]
})
