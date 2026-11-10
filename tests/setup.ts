import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextra-comments-'))
const databaseUrl = `file:${path.join(dir, 'test.db')}`
process.env.DATABASE_URL = databaseUrl

execSync('npx prisma db push --skip-generate', {
  stdio: 'pipe',
  env: { ...process.env, DATABASE_URL: databaseUrl }
})
