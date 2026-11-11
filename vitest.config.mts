import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': root
    }
  },
  test: {
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30_000,
    setupFiles: ['./tests/setup.ts']
  }
})
