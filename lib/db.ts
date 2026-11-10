import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function databaseUrl(): string {
  return process.env.DATABASE_URL ?? 'file:./dev.db'
}

export function createPrismaClient(url = databaseUrl()): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url } }
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
