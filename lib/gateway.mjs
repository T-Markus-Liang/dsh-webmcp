/**
 * dsh-webmcp stdio MCP gateway (v0.3.0).
 *
 * Bridges any MCP client (Claude Code/Desktop, Codex, other harnesses) to the
 * WebMCP tools a website exposes: the same BrowserSession pipeline that backs
 * the dsh plugin tools is reused here, fronted by a newline-delimited
 * JSON-RPC 2.0 server speaking the MCP protocol over stdio.
 *
 * Framing: one complete JSON-RPC message per line (MCP stdio transport).
 * Implemented methods: initialize, ping, tools/list, tools/call.
 * `notifications/initialized` and other notifications are acknowledged by
 * silence (no response), per JSON-RPC.
 */
import { createInterface } from 'node:readline'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createSession, resolveConfig, name as PKG_NAME, version as PKG_VERSION } from './index.js'

export const PROTOCOL_VERSION = '2025-06-18'
const MANIFEST_TTL_MS = 300_000

/** Disk manifest cache (~/.dsh-webmcp/manifests/<sha16>.json), TTL-based.
 *  Cache failures never break serving — every path is guarded. */
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
 * Serve MCP over the given streams.
 *
 * @param {object} opts
 * @param {string} opts.url            Target page whose WebMCP tools are exposed.
 * @param {object} [opts.config]       BrowserSession config (allowPrivateHosts, …).
 * @param {object} [opts.session]      Inject a session (tests); created from config otherwise.
 * @param {stream} [opts.input]        Default process.stdin.
 * @param {stream} [opts.output]       Default process.stdout.
 * @param {number} [opts.manifestTtlMs] Manifest cache TTL; 0 disables cache.
 * @returns {Promise<{close: () => Promise<void>, stats: object}>}
 */
export function serve({ url, config = {}, session = null, input = process.stdin, output = process.stdout, manifestTtlMs = MANIFEST_TTL_MS } = {}) {
  if (!/^https?:\/\//i.test(url || '')) {
    throw new Error('gateway url must start with http:// or https://')
  }
  const cfg = resolveConfig(config)
  const sess = session || createSession(cfg)
  const stats = { discovered: 0, called: 0, manifestHits: 0, manifestMisses: 0 }
  let manifest = null // in-memory: { tools }

  const write = (obj) => output.write(JSON.stringify(obj) + '\n')
  const reply = (id, result) => write({ jsonrpc: '2.0', id, result })
  const replyError = (id, code, message) => write({ jsonrpc: '2.0', id, error: { code, message } })

  async function listTools({ refresh = false } = {}) {
    if (!refresh && manifest && Date.now() - manifest.fetchedAt < manifestTtlMs) {
      stats.manifestHits += 1
      return manifest.tools
    }
    if (!refresh) {
      const disk = loadManifest(url, manifestTtlMs)
      if (disk) {
        stats.manifestHits += 1
        manifest = { fetchedAt: Date.now(), tools: disk }
        return disk
      }
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
      ...(t.annotations ? { annotations: t.annotations } : {}),
    }))
    manifest = { fetchedAt: Date.now(), tools }
    saveManifest(url, tools)
    stats.discovered += 1
    return tools
  }

  async function handle(msg) {
    const { id, method, params } = msg
    if (id === undefined || id === null) return null // notification: no response
    try {
      switch (method) {
        case 'initialize':
          return reply(id, {
            protocolVersion: (params && params.protocolVersion) || PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: PKG_NAME + ' (stdio gateway)', version: PKG_VERSION },
          })
        case 'ping':
          return reply(id, {})
        case 'tools/list':
          return reply(id, { tools: await listTools() })
        case 'tools/call': {
          const name = params && params.name
          if (typeof name !== 'string' || !name) return replyError(id, -32602, 'tools/call requires params.name (string)')
          const args = (params && typeof params.arguments === 'object' && params.arguments) || {}
          let tools = await listTools()
          if (!tools.some((t) => t.name === name)) {
            // Manifest may be stale: one refresh before declaring unknown.
            tools = await listTools({ refresh: true })
          }
          const confirm = Boolean(params && params._meta && params._meta.confirm === true)
          const payload = await sess.invoke(url, name, args, { confirm })
          stats.called += 1
          const isError = payload.ok !== true
          return reply(id, {
            content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
            structuredContent: payload,
            isError,
          })
        }
        default:
          return replyError(id, -32601, `method not found: ${method}`)
      }
    } catch (err) {
      return replyError(id, -32000, String((err && err.message) || err))
    }
  }

  const rl = createInterface({ input, terminal: false })
  const closed = new Promise((resolve) => {
    rl.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      let msg
      try {
        msg = JSON.parse(trimmed)
      } catch {
        write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })
        return
      }
      handle(msg).catch((err) => {
        write({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32000, message: String((err && err.message) || err) } })
      })
    })
    rl.on('close', resolve)
  })

  return {
    stats,
    done: closed,
    close: async () => {
      try { rl.close() } catch (_) {}
      try { await sess.close() } catch (_) {}
    },
  }
}
