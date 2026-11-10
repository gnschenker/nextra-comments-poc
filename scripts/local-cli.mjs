import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const PINNED_NEXT = '15.5.29'

function packageJson(pkgName) {
  const file = path.join(process.cwd(), 'node_modules', pkgName, 'package.json')
  if (!fs.existsSync(file)) {
    console.error(
      `[nextra-comments] ${pkgName} is not in node_modules. Run npm ci from the repo root. Do not use npx ${pkgName}@latest.`
    )
    process.exit(1)
  }
  return {
    dir: path.dirname(file),
    pkg: JSON.parse(fs.readFileSync(file, 'utf8'))
  }
}

export function localBin(pkgName, binName = pkgName) {
  const { dir, pkg } = packageJson(pkgName)
  const binField = pkg.bin
  const rel = typeof binField === 'string' ? binField : binField?.[binName]
  if (!rel) {
    console.error(`[nextra-comments] ${pkgName} has no bin named ${binName}`)
    process.exit(1)
  }
  return {
    version: pkg.version,
    bin: path.join(dir, rel)
  }
}

export function nextCli() {
  const next = localBin('next')
  console.error(`[nextra-comments] using local next@${next.version}`)
  if (next.version !== PINNED_NEXT) {
    console.error(
      `[nextra-comments] next must be exactly ${PINNED_NEXT} (Nextra 4.5.1). Found ${next.version}. Delete node_modules and run npm ci.`
    )
    process.exit(1)
  }
  const major = Number(next.version.split('.')[0])
  // Next 15.5.29 errors on unknown option --webpack. Next 16 requires it when a
  // plugin (Nextra) injects a webpack() config and Turbopack is the default.
  const bundlerFlags = major >= 16 ? ['--webpack'] : []
  return { ...next, bundlerFlags }
}
