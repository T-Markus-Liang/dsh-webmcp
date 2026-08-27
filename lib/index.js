/**
 * dsh-webmcp — WebMCP bridge for DeepSeek Harness.
 *
 * Lets an agent discover and call tools that websites expose via the W3C
 * WebMCP protocol ("site tools"), through a built-in headless Chromium:
 *
 *   - `webmcp_discover(url)`            → list the site's exposed tools
 *   - `webmcp_invoke(url, tool, args)`  → call one tool, get structured JSON
 *
 * Host half only: the helper browser runs in-process via playwright-core;
 * no client bundle is needed.
 *
 * Security model (v0.2): private-network targets are refused unless explicitly
 * allowed — an agent following a prompt-injected instruction must never become
 * an intranet scanner. The helper browser itself uses a throwaway profile, so
 * user cookies/logins are never exposed.
 */

const NAME = 'dsh-webmcp'
const VERSION = '1.0.0'

/** Lossless JSON output descriptor (issue-0001-safe dialect). */
const JSON_OUT = { description: 'lossless JSON result' }

/** Process-level single-instance guard (compat issue 0002 hygiene). */
const ACTIVE_KEY = Symbol.for('dsh-webmcp.active')

/** Private/intranet hostname patterns (case-insensitive). */
const PRIVATE_HOST_RE =
  /^(localhost|127\.|0\.0\.0\.0$|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]$|\[fc[0-9a-f]{2}:|\[fd[0-9a-f]{2}:)/i
const PRIVATE_SUFFIX_RE = /\.(local|internal)$/i

function jsonRender(_args, value) {
  return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
}

function clampInt(v, min, max, dflt) {
  const n = Number.parseInt(String(v), 10)
  if (!Number.isFinite(n)) return dflt
  return Math.min(max, Math.max(min, n))
}

/**
 * True when the hostname targets loopback / private / link-local space.
 * IPv6 private forms matched textually ([::1], fc00::/7 unique-local range
 * heads). Empty host fails closed.
 */
export function isPrivateHostname(hostname) {
  const h = String(hostname || '').trim().toLowerCase()
  if (!h) return true
  return PRIVATE_HOST_RE.test(h) || PRIVATE_SUFFIX_RE.test(h)
}

/** Normalize hostname of an http(s) URL, or null when invalid scheme. */
function hostnameOf(url) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.hostname.toLowerCase()
  } catch {
    return null
  }
}

export function resolveConfig(config = {}) {
  return {
    headless: config.headless !== false,
    navigationTimeoutMs: clampInt(config.navigationTimeoutMs, 5_000, 120_000, 30_000),
    invokeTimeoutMs: clampInt(config.invokeTimeoutMs, 1_000, 60_000, 20_000),
    chromiumPath: typeof config.chromiumPath === 'string' ? config.chromiumPath.trim() : '',
    allowPrivateHosts: config.allowPrivateHosts === true,
    sessionTtlMs: clampInt(config.sessionTtlMs, 0, 600_000, 30_000),
    maxResultChars: clampInt(config.maxResultChars, 1_000, 200_000, 12_000),
    maxSessions: clampInt(config.maxSessions, 1, 8, 3),
    idleTtlMs: clampInt(config.idleTtlMs, 0, 600_000, 30_000),
    trace: config.trace !== false,
  }
}

import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { lookup as dnsLookup } from 'node:dns/promises'
import { DISCOVER_SNIPPET, INVOKE_INSTALL_SNIPPET } from './page-snippet.js'
import { BrowserSessionPool } from './session-pool.js'
import { traceEvent, loadRecentEvents, summarizeEvents, diffManifests } from './trace.mjs'
import { renderDashboard } from './dashboard.js'

function statIsFile(p) {
  return statSync(p).isFile()
}

/** True when candidate path exists. */
function usableFile(p) {
  try {
    return Boolean(p) && statIsFile(p)
  } catch {
    return false
  }
}

/**
 * Resolution order:
 *   1. config.chromiumPath          (cordis.patch.yml)
 *   2. env DSH_WEBMCP_CHROMIUM      (per-host override)
 *   3. Playwright ms-playwright cache scan (any installed chromium build;
 *      full builds preferred over bare headless-shell)
 *   4. system Google Chrome via playwright channel resolution
 */
export function findChromium(cfg) {
  const candidates = []
  if (cfg.chromiumPath) candidates.push(cfg.chromiumPath)
  if (process.env.DSH_WEBMCP_CHROMIUM) candidates.push(process.env.DSH_WEBMCP_CHROMIUM)
  for (const c of candidates) {
    if (usableFile(c)) return c
  }

  const home = homedir()
  const roots =
    process.platform === 'darwin'
      ? [join(home, 'Library', 'Caches', 'ms-playwright')]
      : process.platform === 'win32'
        ? [join(process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'ms-playwright')]
        : [join(home, '.cache', 'ms-playwright')]

  const execNames = process.platform === 'win32'
    ? ['chrome.exe', 'headless_shell.exe']
    : ['chrome', 'headless_shell', 'Google Chrome for Testing', 'chrome-headless-shell']
  for (const root of roots) {
    if (!existsSync(root)) continue
    let builds = []
    try {
      const weight = (d) => (d.startsWith('chromium_headless') ? 1 : 0)
      builds = readdirSync(root)
        .filter((d) => d.startsWith('chromium'))
        .sort((a, b) => weight(a) - weight(b) || b.localeCompare(a))
    } catch {
      continue
    }
    for (const build of builds) {
      const base = join(root, build)
      // Layout varies (chrome-linux/chrome, chrome-mac-arm64/Google Chrome for
      // Testing.app/…, chrome-win/chrome.exe). Shallow recursive walk suffices.
      const hits = walkForExecutables(base, execNames, 4)
      if (hits.length) return hits[0]
    }
  }
  return null
}

function walkForExecutables(dir, names, depth) {
  if (depth <= 0) return []
  const hits = []
  let entries = []
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return hits
  }
  for (const ent of entries) {
    const p = join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name.endsWith('.app')) {
        // macOS app bundle: the real binary lives at Contents/MacOS/<name>.
        hits.push(...walkForExecutables(join(p, 'Contents'), names, depth - 1))
      } else {
        hits.push(...walkForExecutables(p, names, depth - 1))
      }
    } else if (ent.isFile()) {
      const lower = ent.name.toLowerCase()
      const matchName = names.some((n) => lower === n.toLowerCase())
      const macApp = ent.name === 'Google Chrome for Testing' && dir.includes('.app')
      if (matchName || macApp) hits.push(p)
    }
  }
  return hits
}

async function importPlaywrightCore() {
  try {
    return await import('playwright-core')
  } catch (err) {
    throw new Error(
      `${NAME}: playwright-core is not resolvable (${err && err.message}). ` +
      `Install it alongside the plugin, e.g. \`pnpm --dir <profile> add playwright-core\`.`,
    )
  }
}

/**
 * One shared browser + context + page. Navigations are serialized through a
 * promise-chain mutex because a single page cannot serve concurrent calls.
 */
class BrowserSession {
  constructor(cfg) {
    this.cfg = cfg
    this.browser = null
    this.context = null
    this.page = null
    this.launchError = null
    this.launchedWith = null
    this.queue = Promise.resolve()
    // Session-reuse bookkeeping.
    this.lastHref = null
    this.lastNavigatedAt = 0
    this.navigations = 0
    // Manifest-drift baseline: url → last discovered tool-name list.
    this.lastManifests = new Map()
  }

  _enqueue(job) {
    const run = this.queue.then(() => job())
    this.queue = run.catch(() => {}) // keep the chain alive on failures
    return run
  }

  async ensureBrowser(exeOverride) {
    if (this.browser) return
    const pw = await importPlaywrightCore()
    const base = {
      headless: this.cfg.headless,
      args: ['--no-first-run', '--no-default-browser-check'],
    }
    // Ordered fallback chain: preferred path (config/env/cache winner) first,
    // then the system Google Chrome channel. Every attempt's error is kept so
    // a total failure reports the full matrix instead of the last one.
    const attempts = []
    const exe = exeOverride ?? findChromium(this.cfg)
    if (exe) {
      attempts.push({ opts: { ...base, executablePath: exe }, label: `executablePath=${exe}` })
    }
    attempts.push({ opts: { ...base, channel: 'chrome' }, label: "channel='chrome' (system Google Chrome)" })

    let firstError = null
    for (const attempt of attempts) {
      try {
        this.browser = await pw.chromium.launch(attempt.opts)
        this.launchedWith = attempt.label
        this.context = await this.browser.newContext()
        this.page = await this.context.newPage()
        return
      } catch (err) {
        if (!firstError) firstError = { label: attempt.label, message: String((err && err.message) || err) }
      }
    }

    throw new Error(
      `\n${NAME}: failed to launch any Chromium.\n` +
      `Attempted launchers:\n` +
      attempts.map((a) => `  - ${a.label}`).join('\n') +
      `\nFirst error (${firstError.label}): ${firstError.message}\n` +
      `Fix any one way:\n` +
      `  - set config.chromiumPath in cordis.patch.yml\n` +
      `  - export DSH_WEBMCP_CHROMIUM=/path/to/chrome\n` +
      `  - install Google Chrome, or run: npx playwright-core install chromium`,
    )
  }

  /**
   * Navigate unless a fresh-enough navigation to the EXACT same href exists.
   * Returns `{ reused }`; bumps `navigations` only for real navigations.
   */
  async _goto(url, { refresh = false } = {}) {
    await this.ensureBrowser()
    const ttl = this.cfg.sessionTtlMs
    const freshEnough =
      !refresh &&
      ttl > 0 &&
      this.lastHref === url &&
      Date.now() - this.lastNavigatedAt < ttl &&
      Boolean(this.page)

    if (freshEnough) return { reused: true }

    if (!this.cfg.allowPrivateHosts) await assertPublicTarget(url)

    try {
      await this.page.goto(url, { waitUntil: 'load', timeout: this.cfg.navigationTimeoutMs })
    } catch (err) {
      throw navError(err)
    }
    this.navigations += 1
    this.lastHref = url
    this.lastNavigatedAt = Date.now()
    return { reused: false }
  }

  discover(url, { refresh = false } = {}) {
    return this._enqueue(async () => {
      const startedAt = Date.now()
      try {
        const nav = await this._goto(url, { refresh })
        const data = await evalWithTimeout(
          () => this.page.evaluate(DISCOVER_SNIPPET),
          this.cfg.navigationTimeoutMs,
          'discover',
        )
        const tools = Array.isArray(data.tools) ? data.tools : []
        // Manifest drift: compare with the previous discovery of this URL.
        const names = tools.map((t) => t.name)
        const prev = this.lastManifests.get(url)
        const drift = prev ? diffManifests(prev, names) : null
        this.lastManifests.set(url, names)
        const out = {
          ok: true,
          url: data.url || url,
          title: data.title || '',
          count: tools.length,
          tools,
          _meta: { navigations: this.navigations, reused: nav.reused },
        }
        if (drift) out._meta.drift = drift
        if (this.cfg.trace) {
          traceEvent({ kind: 'discover', url, durationMs: Date.now() - startedAt, ok: true, reused: nav.reused })
          if (drift) traceEvent({ kind: 'manifest-drift', url, added: drift.added, removed: drift.removed })
        }
        return out
      } catch (err) {
        if (this.cfg.trace) traceEvent({ kind: 'discover', url, durationMs: Date.now() - startedAt, ok: false, error: (err && err.code) || 'internal' })
        return failOf(err)
      }
    })
  }

  invoke(url, tool, args, { refresh = false } = {}) {
    return this._enqueue(async () => {
      const startedAt = Date.now()
      try {
        const nav = await this._goto(url, { refresh })
        await this.page.evaluate(INVOKE_INSTALL_SNIPPET)
        const payload = await evalWithTimeout(
          () => this.page.evaluate(([n, a]) => window.__dshWebMCPInvoke(n, a), [tool, args == null ? {} : args]),
          this.cfg.invokeTimeoutMs,
          'invoke',
        )
        const out = {
          url,
          tool,
          ...payload,
          _meta: { navigations: this.navigations, reused: nav.reused },
        }
        // Result-size budget: huge tool outputs burn agent tokens. Truncate
        // with a byte count + preview so the agent can refine its args.
        if (payload && payload.ok && payload.result !== undefined) {
          try {
            const serialized = JSON.stringify(payload.result)
            if (serialized.length > this.cfg.maxResultChars) {
              out.result = {
                truncated: true,
                totalBytes: serialized.length,
                preview: serialized.slice(0, this.cfg.maxResultChars),
                hint: 'result exceeded maxResultChars; refine tool args to narrow it',
              }
            }
          } catch (_) { /* non-serializable result: return as-is */ }
        }
        if (this.cfg.trace) traceEvent({ kind: 'invoke', url, tool, durationMs: Date.now() - startedAt, ok: out.ok === true, error: out.ok === true ? undefined : out.error, reused: out._meta && out._meta.reused })
        return out
      } catch (err) {
        if (this.cfg.trace) traceEvent({ kind: 'invoke', url, tool, durationMs: Date.now() - startedAt, ok: false, error: (err && err.code) || 'internal' })
        return { tool, ...failOf(err) }
      }
    })
  }

  async close() {
    this.queue = Promise.resolve()
    try {
      await this.browser?.close()
    } catch (_) {}
    this.browser = null
    this.context = null
    this.page = null
    this.lastHref = null
    this.lastNavigatedAt = 0
    this.navigations = 0
  }

  status() {
    return {
      launched: Boolean(this.browser),
      launchedWith: this.launchedWith,
      lastError: this.launchError,
      stats: { navigations: this.navigations },
    }
  }
}

function evalWithTimeout(promiseFactory, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { const e = new Error(`${label} timed out after ${ms}ms`); e.code = 'timeout'; reject(e) }, ms)
  })
  return Promise.race([promiseFactory().finally(() => clearTimeout(timer)), timeout])
}

function failOf(err) {
  return {
    ok: false,
    error: (err && err.code) || (err && err.name === 'TimeoutError' ? 'timeout' : 'internal'),
    message: String((err && err.message) || err),
  }
}

/** Map navigation failures into a documented error-code taxonomy. */
function navError(err) {
  const msg = String((err && err.message) || err)
  let code = 'navigate-failed'
  if ((err && err.name === 'TimeoutError') || /timeout/i.test(msg)) code = 'timeout'
  else if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN/i.test(msg)) code = 'dns-failed'
  else if (/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_ADDRESS_UNREACHABLE|ECONNREFUSED|ECONNRESET/i.test(msg)) code = 'network'
  const wrapped = new Error(msg)
  wrapped.code = code
  return wrapped
}

/**
 * DNS-rebinding guard: a public-looking hostname may still resolve to a
 * private address. Called after the sync gate passed, before real navigation.
 * Resolution failures are deferred to the browser (surfaced as dns-failed).
 */
async function assertPublicTarget(rawUrl) {
  const host = hostnameOf(rawUrl)
  if (host === null || isPrivateHostname(host)) return
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return // IP literal
  let addrs
  try {
    addrs = await dnsLookup(host, { all: true })
  } catch {
    return
  }
  for (const a of addrs) {
    const ip = String(a.address || '').replace(/^::ffff:/, '')
    if (isPrivateHostname(ip)) {
      const err = new Error(`${host} resolves to private address ${a.address} — DNS rebinding blocked`)
      err.code = 'private-host-blocked'
      throw err
    }
  }
}

export function apply(ctx, config = {}) {
  if (typeof globalThis !== 'undefined') {
    if (globalThis[ACTIVE_KEY]) throw new Error(`${NAME}: plugin is already applied to this host context`)
    globalThis[ACTIVE_KEY] = true
  }

  const cfg = resolveConfig(config)
  const pool = new BrowserSessionPool(cfg)

  /** Fast-fail URL gate shared by both tools. Returns error object or null. */
  function gateUrl(rawUrl) {
    if (!/^https?:\/\//i.test(rawUrl || '')) {
      return { ok: false, error: 'bad-url', message: 'url must start with http:// or https://' }
    }
    const host = hostnameOf(rawUrl)
    if (!cfg.allowPrivateHosts && host !== null && isPrivateHostname(host)) {
      return {
        ok: false,
        error: 'private-host-blocked',
        message:
          `${host} resolves to a private network target. ` +
          `Prompt-injected intranet scanning is denied by design; ` +
          `set allowPrivateHosts:true if this is intentional.`,
      }
    }
    return null
  }

  /** webmcp_discover */
  function discoverTool() {
    return {
      name: 'webmcp_discover',
      description:
        'WebMCP：打开目标网页并枚举该网站通过 W3C WebMCP 协议暴露的全部工具' +
        '（名称/描述/输入Schema/来源层，覆盖 navigator.modelContext 与 document.modelContext 双挂载）。返回无损 JSON。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '目标网页地址（http/https）' },
          refresh: { type: 'boolean', description: '跳过会话复用强制重新导航（默认 false）' },
        },
        required: ['url'],
      },
      output: { schema: JSON_OUT, render: jsonRender },
      execute: async ({ url, refresh = false }) => {
        const blocked = gateUrl(url)
        if (blocked) return blocked
        return pool.run(url, (s) => s.discover(url, { refresh }))
      },
    }
  }

  /** webmcp_invoke */
  function invokeTool() {
    return {
      name: 'webmcp_invoke',
      description:
        'WebMCP：在目标网页上调用一个站点暴露的 WebMCP 工具' +
        '（先用 webmcp_discover 获取工具名与参数 Schema），返回工具的结构化结果。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '目标网页地址（工具所在的页面）' },
          tool: { type: 'string', description: 'WebMCP 工具名' },
          args: { type: 'object', description: '工具入参对象（遵循其 inputSchema）' },
          refresh: { type: 'boolean', description: '跳过会话复用强制重新导航（默认 false）' },
        },
        required: ['url', 'tool'],
      },
      output: { schema: JSON_OUT, render: jsonRender },
      execute: async ({ url, tool, args, refresh = false }) => {
        const blocked = gateUrl(url)
        if (blocked) return blocked
        return pool.run(url, (s) => s.invoke(url, tool, args, { refresh }))
      },
    }
  }

  ctx.inject?.(['tools'], (toolCtx) => {
    toolCtx.tools.register(discoverTool())
    toolCtx.tools.register(invokeTool())
    return () => {}
  })

  // Optional status probe (skip silently on profiles without a webserver).
  ctx.inject?.(['webServer'], (hostCtx) => {
    ctx.effect?.(() => {
      const disposers = [
        hostCtx.webServer.register({
          kind: 'exact',
          path: '/webmcp/dashboard',
          handler: (_req, res) => {
            const events = loadRecentEvents({ maxLines: 500 })
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
            res.end(renderDashboard({
              plugin: NAME,
              version: VERSION,
              config: cfg,
              pool: pool.status(),
              events,
              stats: summarizeEvents(events),
            }))
          },
        }),
        hostCtx.webServer.register({
          kind: 'exact',
          path: '/webmcp/status',
          handler: (_req, res) => {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
            res.end(JSON.stringify({
              plugin: NAME,
              version: VERSION,
              pool: pool.status(),
              stats: summarizeEvents(loadRecentEvents({ maxLines: 500 })),
              config: {
                headless: cfg.headless,
                navigationTimeoutMs: cfg.navigationTimeoutMs,
                invokeTimeoutMs: cfg.invokeTimeoutMs,
                allowPrivateHosts: cfg.allowPrivateHosts,
                sessionTtlMs: cfg.sessionTtlMs,
                maxResultChars: cfg.maxResultChars,
                maxSessions: cfg.maxSessions,
                idleTtlMs: cfg.idleTtlMs,
                trace: cfg.trace,
              },
            }))
          },
        }),
      ]
      return () => disposers.forEach((d) => d())
    }, `${NAME}: http routes`)
  })

  ctx.effect?.(() => () => {
    void pool.close()
    if (typeof globalThis !== 'undefined') delete globalThis[ACTIVE_KEY]
  }, `${NAME}: browser lifecycle`)
}

/**
 * Create a standalone browser session for embedding contexts (the stdio
 * gateway uses this to reuse the exact same discover/invoke pipeline that
 * serves the dsh tools — one code path, two front-ends).
 */
export function createSession(config = {}) {
  return new BrowserSession(resolveConfig(config))
}

export { NAME as name, VERSION as version }

export default { name: NAME, version: VERSION, apply, resolveConfig, findChromium, isPrivateHostname, createSession }
