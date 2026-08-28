/**
 * v1.4.0: HTTP transport tests for the MCP gateway. Node's global fetch, a
 * mock session — no browser required, runs in CI.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serveHttp } from '../lib/gateway.mjs'

const mockSession = () => {
  const calls = { discover: 0, invoke: 0 }
  return {
    calls,
    discover: async () => {
      calls.discover += 1
      return { ok: true, tools: [{ name: 'demo', description: 'demo', inputSchema: {}, annotations: { readOnlyHint: true } }] }
    },
    invoke: async (_url, name, args) => {
      calls.invoke += 1
      return { ok: true, tool: name, result: { echoed: args } }
    },
    close: async () => {},
  }
}

async function rpc(gw, id, method, params, token) {
  const res = await fetch(gw.url + '/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }),
  })
  return res.json()
}

test('gateway http: initialize + tools/list + tools/call + ping', async () => {
  const session = mockSession()
  const gw = await serveHttp({ url: 'https://x.test/app', session, port: 0, host: '127.0.0.1' })
  try {
    const init = await rpc(gw, 1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } })
    assert.equal(init.result.serverInfo.name.includes('gateway'), true)
    assert.equal(init.result.capabilities.tools.listChanged, true)

    const list = await rpc(gw, 2, 'tools/list')
    assert.equal(list.result.tools.length, 1)
    assert.equal(list.result.tools[0].annotations.readOnlyHint, true)

    const call = await rpc(gw, 3, 'tools/call', { name: 'demo', arguments: { x: 1 } })
    assert.equal(call.result.isError, false)
    assert.equal(JSON.parse(call.result.content[0].text).result.echoed.x, 1)

    const ping = await rpc(gw, 4, 'ping')
    assert.deepEqual(ping.result, {})
  } finally {
    await gw.close()
  }
})

test('gateway http: bearer-token auth (401 without / wrong token)', async () => {
  const gw = await serveHttp({ url: 'https://x.test/app', session: mockSession(), port: 0, host: '127.0.0.1', token: 'sekret' })
  try {
    assert.equal((await rpc(gw, 1, 'ping')).error.code, -32001)
    assert.equal((await rpc(gw, 2, 'ping', undefined, 'wrong')).error.code, -32001)
    assert.deepEqual((await rpc(gw, 3, 'ping', undefined, 'sekret')).result, {})
  } finally {
    await gw.close()
  }
})

test('gateway http: GET /sse returns event stream', async () => {
  const gw = await serveHttp({ url: 'https://x.test/app', session: mockSession(), port: 0, host: '127.0.0.1' })
  try {
    const res = await fetch(gw.url + '/sse')
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /text\/event-stream/)
    // SSE is an endless stream — read only the first chunk, then cancel.
    const reader = res.body.getReader()
    const { value } = await reader.read()
    const text = new TextDecoder().decode(value)
    assert.match(text, /event: endpoint\ndata: \/mcp/)
    await reader.cancel()
  } finally {
    await gw.close()
  }
})

test('gateway http: unknown path → 404', async () => {
  const gw = await serveHttp({ url: 'https://x.test/app', session: mockSession(), port: 0, host: '127.0.0.1' })
  try {
    const res = await fetch(gw.url + '/nope')
    assert.equal(res.status, 404)
  } finally {
    await gw.close()
  }
})
