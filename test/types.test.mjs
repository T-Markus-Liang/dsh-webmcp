/**
 * v1.3.0: contract-shape guards for the dsh-webmcp-types declaration file.
 * Fast, CI-safe string-level checks that catch accidental removal of the
 * public type surface or a broken package.json wiring.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dts = readFileSync(join(root, 'types', 'index.d.ts'), 'utf8')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

test('types: core exported declarations present', () => {
  for (const name of [
    'BridgeConfig', 'BridgeConfigInput', 'ToolSurface', 'ToolAnnotations',
    'DiscoveredTool', 'DiscoverResult', 'InvokeResult', 'BridgeErrorCode',
    'ReadinessResult', 'AggregateReadiness', 'SessionStatus', 'PoolStatus',
  ]) {
    assert.ok(/export (?:interface|type)\s+BridgeConfigInput\b/.test(dts) || /export (?:interface|type)\s+\w+/.test(dts.split(name)[0] + ' ' + name), 'missing declaration ' + name)
    // simpler, robust check: the declared name appears after 'export (interface|type)'
    const re = new RegExp('export (interface|type) ' + name + '\\b')
    assert.ok(re.test(dts), 'missing declaration ' + name)
  }
})

test('types: key members present', () => {
  for (const m of [
    'readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint',
    'confirm-required', 'tool-threw', 'private-host-blocked', 'well-known',
    'outputSchema', 'argsWarning', 'maxResultChars', 'maxSessions', 'idleTtlMs',
  ]) {
    assert.ok(dts.includes(m), 'types file must mention ' + m)
  }
})

test('types: package.json wires types + exports to the d.ts', () => {
  assert.equal(pkg.types, 'types/index.d.ts')
  assert.equal(pkg.exports['.'].types, './types/index.d.ts')
  assert.equal(pkg.exports['./types'].types, './types/index.d.ts')
  assert.ok(pkg.files.includes('types'), 'files whitelist must ship types/')
})

test('types: version aligns with the package', () => {
  assert.equal(pkg.version, '1.3.0')
})
