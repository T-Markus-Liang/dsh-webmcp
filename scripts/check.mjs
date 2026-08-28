/**
 * Local dev gate: node --check every source file under lib/ and bin/ before
 * you commit. This is the guard that would have caught the v0.2.1 page-agent
 * brace-imbalance bug before it ever reached a tagged release (that code lives
 * in lib/page-agent.js, which the old CI never syntax-checked).
 *
 * Usage: node scripts/check.mjs   (or via `npm run check`)
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function* jsFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) { yield* jsFiles(full); continue }
    if (/\.(js|mjs)$/.test(name)) yield full
  }
}

let failed = 0
const targets = [...jsFiles(join(root, 'lib')), ...jsFiles(join(root, 'bin'))]
for (const f of targets) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' })
  if (r.status !== 0) {
    failed += 1
    console.error(`✗ ${f}\n${r.stderr.trim()}`)
  } else {
    console.log(`✓ ${f}`)
  }
}

if (failed) {
  console.error(`\n${failed} file(s) failed syntax check.`)
  process.exit(1)
}
console.log(`\nAll ${targets.length} source files pass syntax check.`)
