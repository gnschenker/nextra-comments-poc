import { spawn } from 'node:child_process'
import process from 'node:process'
import { nextCli } from './local-cli.mjs'
import { assertSupportedNode } from './preflight.mjs'

assertSupportedNode()

const subcommand = process.argv[2]
if (!subcommand) {
  console.error('usage: node scripts/run-next.mjs <dev|build|start> [...args]')
  process.exit(1)
}

const { bin, bundlerFlags } = nextCli()
const args = [bin, subcommand]
if (subcommand === 'dev' || subcommand === 'build') {
  args.push(...bundlerFlags)
}
args.push(...process.argv.slice(3))

const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  env: process.env
})
child.on('exit', (code, signal) => {
  if (signal) process.exit(1)
  process.exit(code ?? 1)
})
