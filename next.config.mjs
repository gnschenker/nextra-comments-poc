import nextra from 'nextra'

const withNextra = nextra({})

export default withNextra({
  serverExternalPackages: ['@prisma/client', 'prisma']
})
