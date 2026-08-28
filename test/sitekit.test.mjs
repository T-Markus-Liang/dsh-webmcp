/**
 * v1.5.0: guards for the site-side authoring kit. The snippet is browser-side
 * (not node-runnable), so we validate its structure: syntactically clean,
 * idempotent, dual-mount feature-detect, annotation defaults, no-op fallback,
 * and that the bin CLI exposes --check.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const kit = readFileSync(join(root, 'sitekit', 'webmcp-register.js'), 'utf8')
const bin = readFileSync(join(root, 'bin', 'dsh-webmcp-serve.mjs'), 'utf8')

test('sitekit: snippet is syntactically valid JS', () => {
  const r = spawnSync(process.execPath, ['--check', join(root, 'sitekit', 'webmcp-register.js')], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
})

test('sitekit: dual-mount feature-detect present', () => {
  assert.match(kit, /document\.modelContext/)
  assert.match(kit, /navigator\.modelContext/)
})

test('sitekit: annotation defaults use MCP worst-case (destructiveHint true)', () => {
  assert.match(kit, /destructiveHint:\s*ann\.destructiveHint\s*!==\s*false/)
})

test('sitekit: idempotent guard + silent no-op present', () => {
  assert.match(kit, /__dshWebMCPKit/)
  assert.match(kit, /return false; \/\/ no WebMCP support — silent no-op/)
})

test('sitekit: bin exposes --check readiness audit', () => {
  assert.match(bin, /--check/ && /computeReadiness/)
})
