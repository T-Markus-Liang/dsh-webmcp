/**
 * Unit tests for dsh-webmcp (zero network, zero browser).
 *
 * These exercise the pure, host-side logic only: `resolveConfig` defaults and
 * headless/trim/clamp behaviour, the `findChromium` type contract and env
 * override, the injected page-snippet constants, and the `cordis.patch.yml`
 * text contract. Nothing here launches Chromium or opens a socket.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  resolveConfig,
  findChromium,
  default as def,
} from '../lib/index.js'
import { DISCOVER_SNIPPET, INVOKE_INSTALL_SNIPPET } from '../lib/page-snippet.js'

// ---------------------------------------------------------------------------
// resolveConfig
// ---------------------------------------------------------------------------

test('resolveConfig: defaults', () => {
  const cfg = resolveConfig({})
  assert.equal(cfg.navigationTimeoutMs, 30_000)
  assert.equal(cfg.invokeTimeoutMs, 20_000)
  assert.equal(cfg.headless, true)
  assert.equal(cfg.chromiumPath, '')
})

test('resolveConfig: navigationTimeoutMs clamp (5000..120000)', () => {
  assert.equal(resolveConfig({ navigationTimeoutMs: 0 }).navigationTimeoutMs, 5_000)
  assert.equal(resolveConfig({ navigationTimeoutMs: 5 }).navigationTimeoutMs, 5_000)
  assert.equal(resolveConfig({ navigationTimeoutMs: 999_999 }).navigationTimeoutMs, 120_000)
})

test('resolveConfig: invokeTimeoutMs clamp (1000..60000)', () => {
  assert.equal(resolveConfig({ invokeTimeoutMs: 100 }).invokeTimeoutMs, 1_000)
  assert.equal(resolveConfig({ invokeTimeoutMs: 70_000 }).invokeTimeoutMs, 60_000)
})

test('resolveConfig: headless:false is preserved', () => {
  assert.equal(resolveConfig({ headless: false }).headless, false)
})

test('resolveConfig: chromiumPath is trimmed', () => {
  assert.equal(resolveConfig({ chromiumPath: ' /x ' }).chromiumPath, '/x')
})

test('resolveConfig: non-numeric timeouts fall back to defaults', () => {
  const cfg = resolveConfig({ navigationTimeoutMs: 'abc', invokeTimeoutMs: 'nope' })
  assert.equal(cfg.navigationTimeoutMs, 30_000)
  assert.equal(cfg.invokeTimeoutMs, 20_000)
})

test('resolveConfig: non-string chromiumPath falls back to empty', () => {
  assert.equal(resolveConfig({ chromiumPath: 123 }).chromiumPath, '')
})

// ---------------------------------------------------------------------------
// findChromium
// ---------------------------------------------------------------------------

test('findChromium: result is null or a non-empty string; nonexistent path + no env', (t) => {
  const saved = process.env.DSH_WEBMCP_CHROMIUM
  t.after(() => {
    if (saved === undefined) delete process.env.DSH_WEBMCP_CHROMIUM
    else process.env.DSH_WEBMCP_CHROMIUM = saved
  })

  // Remove any host-level override so only the (non-existent) explicit path and
  // the ms-playwright cache scan can contribute.
  delete process.env.DSH_WEBMCP_CHROMIUM

  const r = findChromium({ chromiumPath: '/no/such/path/xyz-123' })
  assert.ok(r === null || typeof r === 'string', `expected null|string, got ${typeof r}`)
  if (typeof r === 'string') assert.ok(r.length > 0, 'resolved string must not be empty')
})

test('findChromium: env DSH_WEBMCP_CHROMIUM wins when path is unusable', (t) => {
  const saved = process.env.DSH_WEBMCP_CHROMIUM
  t.after(() => {
    if (saved === undefined) delete process.env.DSH_WEBMCP_CHROMIUM
    else process.env.DSH_WEBMCP_CHROMIUM = saved
  })

  // process.execPath is a real readable file, so the env candidate must win.
  process.env.DSH_WEBMCP_CHROMIUM = process.execPath
  const r = findChromium({ chromiumPath: '/no/such/path/xyz-123' })
  assert.equal(r, process.execPath)
})

// ---------------------------------------------------------------------------
// page-snippet constants
// ---------------------------------------------------------------------------

test('page-snippet: DISCOVER_SNIPPET is non-empty and mentions navigator.modelContext', () => {
  assert.ok(typeof DISCOVER_SNIPPET === 'string' && DISCOVER_SNIPPET.length > 0)
  assert.ok(DISCOVER_SNIPPET.includes('navigator.modelContext'), 'missing modelContext scan')
})

test('page-snippet: INVOKE_INSTALL_SNIPPET is non-empty and installs __dshWebMCPInvoke', () => {
  assert.ok(typeof INVOKE_INSTALL_SNIPPET === 'string' && INVOKE_INSTALL_SNIPPET.length > 0)
  assert.ok(INVOKE_INSTALL_SNIPPET.includes('__dshWebMCPInvoke'), 'missing invoke installer')
})

// ---------------------------------------------------------------------------
// cordis.patch.yml text contract
// ---------------------------------------------------------------------------

test('cordis.patch.yml: contains expected plugin registration rows', () => {
  const text = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.ok(text.includes('- id: webmcp'), 'missing "- id: webmcp"')
  assert.ok(text.includes('name: dsh-webmcp'), 'missing "name: dsh-webmcp"')
})

// ---------------------------------------------------------------------------
// default export shape
// ---------------------------------------------------------------------------

test('default export: name is dsh-webmcp and apply is a function', () => {
  assert.equal(def.name, 'dsh-webmcp')
  assert.equal(typeof def.apply, 'function')
})
