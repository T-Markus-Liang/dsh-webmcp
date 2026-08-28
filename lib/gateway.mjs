/**
 * dsh-webmcp MCP gateway (v0.3.0 → v1.4.0).
 *
 * Bridges any MCP client to the WebMCP tools a website exposes, reusing the
 * exact BrowserSession pipeline that backs the dsh plugin tools. Two
 * transports over one protocol core:
 *   - stdio  (v0.3.0): newline-delimited JSON-RPC 2.0 (MCP stdio).
 *   - HTTP   (v1.4.0): Streamable-HTTP style — POST /mcp for request/response
 *     and GET /sse (Server-Sent Events) for server→client notifications
 *     (e.g. tools/list_changed on drift). Optional bearer-token auth.
 *
 * Implemented methods: initialize, ping, tools/list, tools/call.
 * Notifications (initialized, subscribe/unsubscribe) acknowledged by silence.
 */
import { createInterface } from 'node:readline'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createSession, resolveConfig, name as PKG_NAME, version as PKG_VERSION } from './index.js'

export const PROTOCOL_VERSION = '2025-06-18'
const MANIFEST_TTL_MS = 300_000

function manifestPaths(url) {
  const dir = process.env.DSH_WEBMCP_MANIFEST_DIR || join(homedir(), '.dsh-webmcp', 'manifests')
  const key = createHash('sha256').update(url).digest('hex').slice(0, 16) + '.json'
  return { dir, file: join(dir, key) }
}

function loadManifest(url, ttlMs) {
  try {
    const { file } = manifestPaths(url)
    const m = JSON.parse(readFileSync(file, 'utf8'))
    if (m.url === url && Array.isArray(m.tools) && Date.now() - m.fetchedAt < ttlMs) return m.tools
  } catch (_) {}
  return null
}

function saveManifest(url, tools) {
  try {
    const { dir, file } = manifestPaths(url)
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, JSON.stringify({ url, fetchedAt: Date.now(), tools }), 'utf8')
  } catch (_) {}
}

/**
 * Transport-agnostic protocol core. `emit(obj)` receives server-initiated
 * notifications (drift → tools/list_changed); the transport decides whether
 * and to whom to forward them.
 */
function createCore({ url, config = {}, session = null, manifestTtlMs = MANIFEST_TTL_MS, emit = () => {} }) {
  let transportEmit = emit
  if (!/^https?:\/\//i.test(url || '')) throw new Error('gateway url must start with http:// or https://')
  const cfg = resolveConfig(config)
  const sess = session || createSession(cfg)
  const stats = { discovered: 0, called: 0, manifestHits: 0, manifestMisses: 0 }
  let manifest = null
  let lastNames = null
  let toolsSubscribed = false

  async function listTools({ refresh = false } = {}) {
    if (!refresh && manifest && Date.now() - manifest.fetchedAt < manifestTtlMs) {
      stats.manifestHits += 1
      return manifest.tools
    }
    if (!refresh) {
      const disk = loadManifest(url, manifestTtlMs)
      if (disk) { stats.manifestHits += 1; manifest = { fetchedAt: Date.now(), tools: disk }; return disk }
    }
    stats.manifestMisses += 1
    const disc = await sess.discover(url, { refresh })
    if (!disc.ok) {
      const err = new Error(`discover failed: ${disc.error} — ${disc.message || ''}`)
      err.payload = disc
      throw err
    }
    const tools = (disc.tools || []).map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || { type: 'object', properties: {} },
      ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}),
      ...(t.annotations ? { annotations: t.annotations } : {}),
    }))
    manifest = { fetchedAt: Date.now(), tools }
    saveManifest(url, tools)
    stats.discovered += 1
    const namesNow = tools.map((t) => t.name).sort().join('\n')
    if (lastNames !== null && lastNames !== namesNow) {
      transportEmit({ jsonrpc: '2.0', method: 'notifications/tools/list_changed', params: {} })
    }
    lastNames = namesNow
    return tools
  }

  /** Handle one JSON-RPC message, returning a response envelope (or null). */
  async function handleMessage(msg) {
    const { id, method, params } = msg
    if ((id === undefined || id === null) && method !== 'notifications/subscribe' && method !== 'notifications/unsubscribe') return null
    try {
      switch (method) {
        case 'initialize':
          return { id, result: {
            protocolVersion: (params && params.protocolVersion) || PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: true } },
            serverInfo: { name: PKG_NAME + ' (gateway)', version: PKG_VERSION },
          } }
        case 'ping':
          return { id, result: {} }
        case 'tools/list':
          return { id, result: { tools: await listTools() } }
        case 'notifications/subscribe':
          if (params && params.method === 'tools/list_changed') toolsSubscribed = true
          return null
        case 'notifications/unsubscribe':
          if (params && params.method === 'tools/list_changed') toolsSubscribed = false
          return null
        case 'tools/call': {
          const name = params && params.name
          if (typeof name !== 'string' || !name) return { id, error: { code: -32602, message: 'tools/call requires params.name (string)' } }
          const args = (params && typeof params.arguments === 'object' && params.arguments) || {}
          let tools = await listTools()
          if (!tools.some((t) => t.name === name)) tools = await listTools({ refresh: true })
          const confirm = Boolean(params && params._meta && params._meta.confirm === true)
          const payload = await sess.invoke(url, name, args, { confirm })
          stats.called += 1
          return { id, result: {
            content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
            structuredContent: payload,
            isError: payload.ok !== true,
          } }
        }
        default:
          return { id, error: { code: -32601, message: `method not found: ${method}` } }
      }
    } catch (err) {
      return { id, error: { code: -32000, message: String((err && err.message) || err) } }
    }
  }

  return {
    session: sess,
    stats,
    listTools,
    handleMessage,
    setEmit: (fn) => { transportEmit = fn },
    setSubscribed: (v) => { toolsSubscribed = v },
    isSubscribed: () => toolsSubscribed,
    manifestUrl: url,
  }
}

/** stdio transport (MCP stdio: newline-delimited JSON). */
export function serve({ url, config = {}, session = null, input = process.stdin, output = process.stdout, manifestTtlMs = MANIFEST_TTL_MS } = {}) {
  const core = createCore({ url, config, session, manifestTtlMs })
  const write = (obj) => output.write(JSON.stringify(obj) + '\n')
  // stdio forwards server notifications only to a subscribed client.
  core.setEmit((obj) => { if (core.isSubscribed()) write(obj) })
  const rl = createInterface({ input, terminal: false })
  const closed = new Promise((resolve) => {
    rl.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      let msg
      try { msg = JSON.parse(trimmed) } catch {
        write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })
        return
      }
      core.handleMessage(msg)
        .then((res) => { if (res) write({ jsonrpc: '2.0', ...res }) })
        .catch((err) => write({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32000, message: String(err && err.message || err) } }))
    })
    rl.on('close', resolve)
  })
  return {
    stats: core.stats,
    done: closed,
    close: async () => {
      try { rl.close() } catch (_) {}
      try { await core.session.close() } catch (_) {}
    },
  }
}

/**
 * HTTP transport (v1.4.0): POST /mcp for request/response, GET /sse for
 * server notifications. Optional bearer-token auth. Built on the same core.
 *
 * @returns {Promise<{server, address, stats, close}>}
 */
export function serveHttp({ url, config = {}, session = null, port = 0, host = '127.0.0.1', token = null, manifestTtlMs = MANIFEST_TTL_MS } = {}) {
  const core = createCore({ url, config, session, manifestTtlMs })
  const subscribers = new Set()

  core.setEmit((obj) => {
    for (const res of subscribers) res.write(`event: message\ndata: ${JSON.stringify(obj)}\n\n`)
  })

  const server = createServer((req, res) => {
    // Auth gate.
    if (token && req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'unauthorized: missing/invalid bearer token' } }))
      return
    }
    const urlPath = (req.url || '/').split('?')[0]

    if (req.method === 'GET' && urlPath === '/sse') {
      res.writeHead(200, {
        'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive',
      })
      res.write('event: endpoint\ndata: /mcp\n\n')
      subscribers.add(res)
      const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000)
      req.on('close', () => { clearInterval(heartbeat); subscribers.delete(res) })
      return
    }

    if (req.method === 'POST' && urlPath === '/mcp') {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        let msg
        try { msg = JSON.parse(body || '{}') } catch {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }))
          return
        }
        core.handleMessage(msg)
          .then((out) => {
            res.writeHead(200, { 'content-type': 'application/json' })
            if (out) res.end(JSON.stringify({ jsonrpc: '2.0', ...out }))
            else res.end('') // notification: 200 empty body
          })
          .catch((err) => {
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32000, message: String(err && err.message || err) } }))
          })
      })
      return
    }

    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32601, message: 'not found' } }))
  })

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const address = server.address()
      resolve({
        server,
        address,
        stats: core.stats,
        url: `http://${host}:${address.port}`,
        close: async () => {
          for (const s of subscribers) try { s.end() } catch (_) {}
          subscribers.clear()
          await new Promise((r) => server.close(() => r()))
          try { await core.session.close() } catch (_) {}
        },
      })
    })
    server.on('error', (err) => { throw err })
  })
}
