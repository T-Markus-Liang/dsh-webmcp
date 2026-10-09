#!/usr/bin/env node
/**
 * dsh-webmcp-serve — stdio MCP gateway for a website's WebMCP tools.
 *
 *   dsh-webmcp-serve <url> [--allow-private-hosts] [--manifest-ttl-ms N] [--no-cache]
 *
 * MCP client config example (Claude Desktop / Code):
 *   {
 *     "mcpServers": {
 *       "my-site": {
 *         "command": "node",
 *         "args": ["/path/to/dsh-webmcp/bin/dsh-webmcp-serve.mjs", "https://example.com/app"]
 *       }
 *     }
 *   }
 */
import { serve, serveHttp } from '../lib/gateway.mjs'
import { createSession } from '../lib/index.js'
import { computeReadiness } from '../lib/readiness.mjs'

const argv = process.argv.slice(2)
const usage = () => {
  console.error('usage: dsh-webmcp-serve <url> [--allow-private-hosts] [--manifest-ttl-ms N] [--no-cache]')
  process.exit(2)
}

if (argv.includes('--help') || argv.includes('-h')) usage()

const url = argv.find((a) => /^https?:\/\//i.test(a))
if (!url) usage()

const httpMode = argv.includes('--http')
const host = argv.includes('--host') && argv[argv.indexOf('--host') + 1] ? argv[argv.indexOf('--host') + 1] : '127.0.0.1'
const port = argv.includes('--port') && argv[argv.indexOf('--port') + 1] ? Number(argv[argv.indexOf('--port') + 1]) : 0
const token = argv.includes('--token') && argv[argv.indexOf('--token') + 1] ? argv[argv.indexOf('--token') + 1] : null

const config = { allowPrivateHosts: argv.includes('--allow-private-hosts') }
let manifestTtlMs = 300_000
const ttlIdx = argv.indexOf('--manifest-ttl-ms')
if (ttlIdx !== -1 && argv[ttlIdx + 1]) manifestTtlMs = Number(argv[ttlIdx + 1]) || manifestTtlMs
if (argv.includes('--no-cache')) manifestTtlMs = 0

// --check <url>: agent-readiness audit (v1.5.0). Prints a report; exit 0 if
// score >= 60, 2 if discover fails, 1 if the site is below readiness.
if (argv.includes('--check')) {
  const sess = createSession(config)
  try {
    const disc = await sess.discover(url)
    if (!disc.ok) {
      console.error(`[dsh-webmcp-serve --check] discover failed: ${disc.error} — ${disc.message || ''}`)
      process.exit(2)
    }
    const r = computeReadiness(disc.tools)
    console.log(JSON.stringify({ url, ok: true, title: disc.title, tools: disc.tools.length, ...r }, null, 2))
    process.exit(r.score != null && r.score >= 60 ? 0 : 1)
  } finally {
    await sess.close()
  }
}

let server
if (httpMode) {
  server = await serveHttp({ url, config, manifestTtlMs, host, port, token })
  console.error(`[dsh-webmcp-serve] HTTP gateway listening on ${server.url} (token: ${token ? 'on' : 'off'})`)
} else {
  server = serve({ url, config, manifestTtlMs })
  console.error(`[dsh-webmcp-serve] stdio gateway serving ${url}`)
}

// Diagnostics go to stderr only — stdout is the MCP channel.


const shutdown = async (signal) => {
  console.error(`[dsh-webmcp-serve] ${signal} received; closing`)
  await server.close()
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

if (httpMode) {
  // HTTP mode has no stdin-driven shutdown; wait on signals only.
  await new Promise((r) => setTimeout(r, 2 ** 31 - 1))
}

server.done.then(async () => {
  // stdin closed by the MCP client → normal exit path.
  await server.close()
  process.exit(0)
})
