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

// ---------------------------------------------------------------------------
// v0.2: private-network shield + session-reuse config
// ---------------------------------------------------------------------------

test('resolveConfig: allowPrivateHosts defaults to false and honors true', () => {
  assert.equal(resolveConfig({}).allowPrivateHosts, false)
  assert.equal(resolveConfig({ allowPrivateHosts: true }).allowPrivateHosts, true)
})

test('resolveConfig: sessionTtlMs default 30000, clamped to [0..600000]', () => {
  assert.equal(resolveConfig({}).sessionTtlMs, 30_000)
  assert.equal(resolveConfig({ sessionTtlMs: -1 }).sessionTtlMs, 0)
  assert.equal(resolveConfig({ sessionTtlMs: 999_999 }).sessionTtlMs, 600_000)
})

test('isPrivateHostname: private / link-local / unique-local hit', async () => {
  const { isPrivateHostname } = await import('../lib/index.js')
  const hits = [
    'localhost', 'LOCALHOST',
    '127.0.0.1', '127.255.0.7',
    '10.1.2.3',
    '192.168.1.1',
    '172.16.0.1', '172.31.255.255',
    '169.254.9.9',
    '[::1]',
    '[fc00::1]', '[fd12:3456::a]',
    'box.local', 'srv.INTERNAL',
  ]
  for (const host of hits) {
    assert.equal(isPrivateHostname(host), true, `expected PRIVATE: ${host}`)
  }
})

test('isPrivateHostname: public hosts pass through', async () => {
  const { isPrivateHostname } = await import('../lib/index.js')
  const misses = [
    'example.com',
    'api.deepseek.com',
    '172.32.0.1', // outside 172.16/12
    '172.15.255.255', // below the range
    'sub.example.org',
  ]
  for (const host of misses) {
    assert.equal(isPrivateHostname(host), false, `expected PUBLIC: ${host}`)
  }
})

test('isPrivateHostname: empty hostname fails closed', async () => {
  const { isPrivateHostname } = await import('../lib/index.js')
  assert.equal(isPrivateHostname(''), true)
})

// --- v0.3.0: stdio gateway protocol (no browser — mock session injection) ---

async function withGateway(run) {
  const { serve } = await import('../lib/gateway.mjs')
  const { PassThrough } = await import('node:stream')
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  process.env.DSH_WEBMCP_MANIFEST_DIR = mkdtempSync(join(tmpdir(), 'dsh-webmcp-mf-'))
  const input = new PassThrough()
  const output = new PassThrough()
  const calls = { discover: 0, invoke: 0 }
  const mockSession = {
    discover: async () => {
      calls.discover += 1
      return {
        ok: true,
        tools: [{ name: 'demo', description: 'demo tool', inputSchema: { type: 'object', properties: { x: { type: 'number' } } } }],
      }
    },
    invoke: async (url, name, args) => {
      calls.invoke += 1
      return { ok: true, tool: name, result: { echoed: args } }
    },
    close: async () => {},
  }
  const uniqueUrl = 'https://example.test/app?r=' + Date.now() + '-' + Math.floor(Math.random() * 1e6)
  const server = serve({ url: uniqueUrl, session: mockSession, input, output, manifestTtlMs: 60_000 })
  const pending = new Map()
  let buf = ''
  output.on('data', (d) => {
    buf += d.toString()
    for (;;) {
      const i = buf.indexOf('\n')
      if (i === -1) break
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      const msg = JSON.parse(line)
      if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
      else if (msg.id === null && msg.error && pending.has('parse-error')) { pending.get('parse-error')(msg); pending.delete('parse-error') }
    }
  })
  const rpc = (id, method, params) => new Promise((resolve) => {
    pending.set(id, resolve)
    input.write(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }) + '\n')
  })
  try {
    await run({ rpc, input, pending, calls })
  } finally {
    await server.close()
  }
}

test('gateway: initialize + ping handshake', async () => {
  await withGateway(async ({ rpc }) => {
    const init = await rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'unit', version: '0' } })
    assert.ok(init.result.serverInfo.name.includes('dsh-webmcp'))
    assert.equal(init.result.protocolVersion, '2025-06-18')
    assert.ok(init.result.capabilities.tools)
    const ping = await rpc(2, 'ping')
    assert.deepEqual(ping.result, {})
  })
})

test('gateway: tools/list maps discovered tools (cached)', async () => {
  await withGateway(async ({ rpc, calls }) => {
    const first = await rpc(1, 'tools/list')
    assert.equal(first.result.tools.length, 1)
    assert.equal(first.result.tools[0].name, 'demo')
    assert.equal(first.result.tools[0].inputSchema.properties.x.type, 'number')
    const second = await rpc(2, 'tools/list')
    assert.equal(second.result.tools.length, 1)
    assert.equal(calls.discover, 1, 'second tools/list must hit the manifest cache')
  })
})

test('gateway: tools/call round-trips into session.invoke', async () => {
  await withGateway(async ({ rpc, calls }) => {
    const res = await rpc(1, 'tools/call', { name: 'demo', arguments: { x: 42 } })
    assert.equal(res.result.isError, false)
    const payload = JSON.parse(res.result.content[0].text)
    assert.equal(payload.ok, true)
    assert.equal(payload.result.echoed.x, 42)
    assert.equal(calls.invoke, 1)
  })
})

test('gateway: malformed line gets -32700 parse error', async () => {
  await withGateway(async ({ input, pending }) => {
    const errMsg = await new Promise((resolve) => {
      pending.set('parse-error', resolve)
      input.write('{not json\n')
    })
    assert.equal(errMsg.error.code, -32700)
    assert.equal(errMsg.id, null)
  })
})

test('gateway: list_changed pushed to a subscribed client on drift', async () => {
  const { serve } = await import('../lib/gateway.mjs')
  const { PassThrough } = await import('node:stream')
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  process.env.DSH_WEBMCP_MANIFEST_DIR = mkdtempSync(join(tmpdir(), 'dsh-webmcp-mf-'))
  const input = new PassThrough()
  const output = new PassThrough()
  let n = 0
  const mockSession = {
    discover: async () => {
      n += 1
      const tools = [{ name: 'a', description: 'a', inputSchema: {} }]
      if (n >= 2) tools.push({ name: 'b', description: 'b', inputSchema: {} })
      return { ok: true, tools }
    },
    invoke: async () => ({ ok: true, result: {} }),
    close: async () => {},
  }
  const server = serve({ url: 'https://drift.test', session: mockSession, input, output, manifestTtlMs: 0 })
  const messages = []
  const pending = new Map()
  output.on('data', (d) => {
    for (const line of d.toString().split('\n')) {
      const t = line.trim()
      if (!t) continue
      let m
      try { m = JSON.parse(t) } catch { continue }
      messages.push(m)
      if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
    }
  })
  const rpc = (id, method, params) => new Promise((resolve) => {
    pending.set(id, resolve)
    input.write(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }) + '\n')
  })
  try {
    await rpc(1, 'tools/list') // discover #1 → lastNames = [a]
    input.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/subscribe', params: { method: 'tools/list_changed' } }) + '\n')
    await rpc(2, 'tools/call', { name: 'nope', arguments: {} }) // unknown → refresh → discover #2 grows set
    await new Promise((r) => setTimeout(r, 120))
    const notif = messages.find((m) => m.method === 'notifications/tools/list_changed')
    assert.ok(notif, 'expected notifications/tools/list_changed after drift')
  } finally {
    await server.close()
  }
})

test('gateway: unknown method gets -32601', async () => {
  await withGateway(async ({ rpc }) => {
    const res = await rpc(9, 'resources/list')
    assert.equal(res.error.code, -32601)
  })
})
