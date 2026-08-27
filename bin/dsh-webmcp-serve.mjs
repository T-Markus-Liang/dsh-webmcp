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
import { serve } from '../lib/gateway.mjs'

const argv = process.argv.slice(2)
const usage = () => {
  console.error('usage: dsh-webmcp-serve <url> [--allow-private-hosts] [--manifest-ttl-ms N] [--no-cache]')
  process.exit(2)
}

if (argv.includes('--help') || argv.includes('-h')) usage()

const url = argv.find((a) => /^https?:\/\//i.test(a))
if (!url) usage()

const config = { allowPrivateHosts: argv.includes('--allow-private-hosts') }
let manifestTtlMs = 300_000
const ttlIdx = argv.indexOf('--manifest-ttl-ms')
if (ttlIdx !== -1 && argv[ttlIdx + 1]) manifestTtlMs = Number(argv[ttlIdx + 1]) || manifestTtlMs
if (argv.includes('--no-cache')) manifestTtlMs = 0

const server = serve({ url, config, manifestTtlMs })

// Diagnostics go to stderr only — stdout is the MCP channel.
console.error(`[dsh-webmcp-serve] serving ${url} (private hosts: ${config.allowPrivateHosts ? 'allowed' : 'denied'})`)

const shutdown = async (signal) => {
  console.error(`[dsh-webmcp-serve] ${signal} received; closing`)
  await server.close()
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

server.done.then(async () => {
  // stdin closed by the MCP client → normal exit path.
  await server.close()
  process.exit(0)
})
