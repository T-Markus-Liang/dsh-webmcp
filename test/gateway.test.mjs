/**
 * stdio MCP gateway end-to-end test for dsh-webmcp.
 *
 * Hard gate: only runs when `DSH_WEBMCP_TEST_E2E === '1'` AND a usable
 * Chromium/Chrome is resolvable via `findChromium(resolveConfig({}))`.
 * Otherwise the whole test is skipped (mirroring the gating style in
 * test/e2e.test.mjs).
 *
 * When it does run it spawns the real `bin/dsh-webmcp-serve.mjs` gateway as a
 * child process speaking newline-delimited JSON-RPC 2.0 (MCP stdio) over
 * stdin/stdout, points it at the in-process fixture site, then exercises the
 * frozen protocol contract: initialize handshake, the notifications/initialized
 * no-response notification, tools/list over the 5 fixture tools, tools/call
 * (happy + unknown-tool + missing-required-args), ping, and the -32700 parse
 * error path. The child is SIGTERM'd (with a SIGKILL fallback) and the fixture
 * site is stopped in `finally`.
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { findChromium, resolveConfig } from '../lib/index.js'
import { startSite, stopSite } from './site-fixture.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GW_BIN = 'bin/dsh-webmcp-serve.mjs'
const RPC_TIMEOUT_MS = 60_000

const e2eAvailable =
  process.env.DSH_WEBMCP_TEST_E2E === '1' && Boolean(findChromium(resolveConfig({})))

const skipReason = !e2eAvailable
  ? 'e2e disabled: set DSH_WEBMCP_TEST_E2E=1 and have a usable Chromium (DSH_WEBMCP_CHROMIUM / ms-playwright cache)'
  : false

/**
 * Spawn the stdio gateway as a child process and return a tiny line-delimited
 * JSON-RPC 2.0 client over its stdio pipes. stderr is swallowed.
 */
function spawnGateway(url) {
  const child = spawn('node', [GW_BIN, url, '--allow-private-hosts'], {
    cwd: repoRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let spawnErr = null
  child.on('error', (err) => { spawnErr = err })
  child.stderr.on('data', () => {}) // diagnostics side-channel → swallow

  // Line accumulator → FIFO of parsed objects; waiters consume in order.
  let buf = ''
  const queue = []
  const waiters = []
  child.stdout.on('data', (chunk) => {
    buf += chunk
    let idx
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line) continue
      let obj
      try {
        obj = JSON.parse(line)
      } catch {
        obj = { __raw: line }
      }
      if (waiters.length) waiters.shift()(obj)
      else queue.push(obj)
    }
  })

  const nextLine = () =>
    new Promise((resolveLine, rejectLine) => {
      if (spawnErr) return rejectLine(spawnErr)
      if (queue.length) return resolveLine(queue.shift())
      const waiter = (obj) => {
        clearTimeout(timer)
        resolveLine(obj)
      }
      waiters.push(waiter)
      const timer = setTimeout(() => {
        const i = waiters.indexOf(waiter)
        if (i !== -1) waiters.splice(i, 1)
        rejectLine(new Error(`gateway: no response within ${RPC_TIMEOUT_MS}ms`))
      }, RPC_TIMEOUT_MS)
    })

  let nextId = 1
  const write = (s) => child.stdin.write(s + '\n')

  /** Send a request with an id and await the matching response line. */
  const request = async (method, params) => {
    const id = nextId++
    write(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
    return nextLine()
  }

  /** Send a notification (no id, no response expected). */
  const notify = (method, params) => {
    write(JSON.stringify({ jsonrpc: '2.0', method, params }))
  }

  /** Write a raw line verbatim (for the malformed-JSON path). */
  const writeRaw = (s) => write(s)

  // Resolve on 'exit' for a normal close and on 'error' for a failed spawn,
  // so a never-started child cannot hang the cleanup `await`.
  const exited = new Promise((resolveExit) => {
    child.once('exit', () => resolveExit())
    child.once('error', () => resolveExit())
  })

  return { child, request, notify, writeRaw, nextLine, exited }
}

/**
 * In a live-gateway run, terminate the child and wait for it to exit.
 * Send SIGTERM first; if it hasn't exited after a 10s grace, force SIGKILL.
 */
async function terminateChild(child, exited) {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  const graceful = new Promise((resolveGrace) => {
    const t = setTimeout(() => resolveGrace('timeout'), 10_000)
    exited.then(() => { clearTimeout(t); resolveGrace('exited') })
  })
  if ((await graceful) === 'timeout' && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await exited
  }
}

test('webmcp gateway stdio: frozen protocol contract', { timeout: 120_000, skip: skipReason }, async () => {
  const site = await startSite()
  const gw = spawnGateway(site.url())
  try {
    // ---- 1. initialize handshake -----------------------------------------
    const init = await gw.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'gateway-test', version: '1.0.0' },
    })
    assert.equal(init.jsonrpc, '2.0')
    assert.ok(init.result, `initialize missing result: ${JSON.stringify(init)}`)
    assert.match(init.result.serverInfo.name, /dsh-webmcp/, 'serverInfo.name must contain dsh-webmcp')
    assert.equal(init.result.protocolVersion, '2025-06-18', 'protocolVersion must be echoed back')
    assert.deepEqual(init.result.capabilities, { tools: { listChanged: false } })

    // ---- initialized notification (no id → no response) ------------------
    gw.notify('notifications/initialized')

    // ---- 2. tools/list contains all 5 fixture tools ----------------------
    const list = await gw.request('tools/list', {})
    assert.ok(list.result, `tools/list missing result: ${JSON.stringify(list)}`)
    const tools = list.result.tools
    assert.ok(Array.isArray(tools), 'result.tools must be an array')
    const names = tools.map((t) => t.name).sort()
    assert.deepEqual(names, ['add', 'docTitle', 'echo', 'greet', 'pageTitle'],
      'tools/list must expose exactly the 5 fixture tools')
    for (const t of tools) {
      assert.ok(typeof t.name === 'string' && t.name, `tool missing name: ${JSON.stringify(t)}`)
      assert.ok(typeof t.description === 'string', `tool ${t.name} missing description`)
      assert.ok(t.inputSchema && typeof t.inputSchema === 'object', `tool ${t.name} missing inputSchema`)
    }

    // ---- 3. tools/call echo happy path -----------------------------------
    const echo = await gw.request('tools/call', { name: 'echo', arguments: { text: 'mcp-smoke' } })
    assert.equal(echo.result.isError, false, 'echo must not be an error')
    const echoPayload = JSON.parse(echo.result.content[0].text)
    assert.equal(echoPayload.ok, true)
    assert.equal(echoPayload.result.echo, 'mcp-smoke')

    // ---- 4. tools/call unknown tool --------------------------------------
    const nope = await gw.request('tools/call', { name: 'nope', arguments: {} })
    assert.equal(nope.result.isError, true, 'unknown tool must be flagged as an error')
    const nopePayload = JSON.parse(nope.result.content[0].text)
    assert.equal(nopePayload.ok, false)
    assert.equal(nopePayload.error, 'unknown-tool')

    // ---- 5. tools/call greet missing required args -----------------------
    const greet = await gw.request('tools/call', { name: 'greet' })
    const greetPayload = JSON.parse(greet.result.content[0].text)
    assert.ok(greetPayload.argsWarning, `expected argsWarning, got: ${JSON.stringify(greetPayload)}`)
    assert.match(greetPayload.argsWarning, /missing required args: name/)

    // ---- 6. ping → empty result object -----------------------------------
    const pong = await gw.request('ping', {})
    assert.deepEqual(pong.result, {})

    // ---- 7. malformed JSON line → -32700 parse error ---------------------
    gw.writeRaw('{this is not valid json')
    const parseErr = await gw.nextLine()
    assert.equal(parseErr.jsonrpc, '2.0')
    assert.equal(parseErr.id, null)
    assert.equal(parseErr.error.code, -32700)
  } finally {
    await terminateChild(gw.child, gw.exited)
    await stopSite()
  }
})
