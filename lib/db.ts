import path from 'node:path'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '@/generated/prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? 'file:./prisma/dev.db'
}

export function sqliteFileFromUrl(url: string): string {
  const file = url.startsWith('file:') ? url.slice('file:'.length) : url
  return path.isAbsolute(file) ? file : path.resolve(process.cwd(), file)
}

export function createPrismaClient(url = databaseUrl()): PrismaClient {
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    throw new Error(
      'Postgres needs @prisma/adapter-pg. See README "Switch to Postgres". SQLite uses @prisma/adapter-better-sqlite3.'
    )
  }
  const adapter = new PrismaBetterSqlite3({
    url: `file:${sqliteFileFromUrl(url)}`
  })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
