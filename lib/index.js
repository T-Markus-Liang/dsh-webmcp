/**
 * dsh-webmcp — WebMCP bridge for DeepSeek Harness.
 *
 * Lets an agent discover and call tools that websites expose via the W3C
 * WebMCP protocol ("site tools"), through a built-in headless Chromium:
 *
 *   - `webmcp_discover(url)`        → list the site's exposed tools
 *   - `webmcp_invoke(url, tool, args)` → call one tool, get structured JSON
 *
 * Host half only: the helper browser runs in-process via playwright-core;
 * no client bundle is needed for v0.1.
 *
 * Runtime contracts mirrored from dsh-game-studio (verified on rc.8):
 *   - tools.register(tool): parameters map w/ JSON-schema-subset types,
 *     output REQUIRED `{ schema, render }`, render returns blocks array.
 *   - Agent-scoped discovery: register under ctx.inject(['tools'], …).
 */

const NAME = 'dsh-webmcp'
const VERSION = '0.1.1'

/** Lossless JSON output descriptor (issue-0001-safe dialect). */
const JSON_OUT = { description: 'lossless JSON result' }

/** Process-level single-instance guard (compat issue 0002 hygiene). */
const ACTIVE_KEY = Symbol.for('dsh-webmcp.active')

function jsonRender(_args, value) {
  return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
}

function clampInt(v, min, max, dflt) {
  const n = Number.parseInt(String(v), 10)
  if (!Number.isFinite(n)) return dflt
  return Math.min(max, Math.max(min, n))
}

export function resolveConfig(config = {}) {
  return {
    headless: config.headless !== false,
    navigationTimeoutMs: clampInt(config.navigationTimeoutMs, 5_000, 120_000, 30_000),
    invokeTimeoutMs: clampInt(config.invokeTimeoutMs, 1_000, 60_000, 20_000),
    chromiumPath: typeof config.chromiumPath === 'string' ? config.chromiumPath.trim() : '',
  }
}

/** True when candidate path exists and looks executable-named. */
function usableFile(p) {
  try {
    return Boolean(p) && statIsFile(p)
  } catch {
    return false
  }
}

import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DISCOVER_SNIPPET, INVOKE_INSTALL_SNIPPET } from './page-snippet.js'

function statIsFile(p) {
  return statSync(p).isFile()
}

/**
 * Resolution order:
 *   1. config.chromiumPath          (cordis.patch.yml)
 *   2. env DSH_WEBMCP_CHROMIUM      (per-host override)
 *   3. Playwright ms-playwright cache scan (any installed chromium build)
 *   4. null → let playwright-core fall back (its registry / channel resolution)
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

  const execNames = process.platform === 'win32' ? ['chrome.exe', 'headless_shell.exe'] : ['chrome', 'headless_shell', 'Google Chrome for Testing', 'chrome-headless-shell']
  for (const root of roots) {
    if (!existsSync(root)) continue
    let builds = []
    try {
      // Prefer full Chromium builds over the bare headless shell: same runtime
      // contract for us, but the full build is closer to what users test with.
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

  async _goto(url) {
    await this.ensureBrowser()
    await this.page.goto(url, { waitUntil: 'load', timeout: this.cfg.navigationTimeoutMs })
  }

  discover(url) {
    return this._enqueue(async () => {
      try {
        await this._goto(url)
        const data = await evalWithTimeout(
          () => this.page.evaluate(DISCOVER_SNIPPET),
          this.cfg.navigationTimeoutMs,
          'discover',
        )
        return {
          ok: true,
          url: data.url || url,
          title: data.title || '',
          count: Array.isArray(data.tools) ? data.tools.length : 0,
          tools: Array.isArray(data.tools) ? data.tools : [],
        }
      } catch (err) {
        return failOf(err)
      }
    })
  }

  invoke(url, tool, args) {
    return this._enqueue(async () => {
      try {
        await this._goto(url)
        await this.page.evaluate(INVOKE_INSTALL_SNIPPET)
        const payload = await evalWithTimeout(
          () => this.page.evaluate(([n, a]) => window.__dshWebMCPInvoke(n, a), [tool, args == null ? {} : args]),
          this.cfg.invokeTimeoutMs,
          'invoke',
        )
        return {
          url: url,
          tool,
          ...payload,
        }
      } catch (err) {
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
  }

  status() {
    return {
      launched: Boolean(this.browser),
      launchedWith: this.launchedWith,
      lastError: this.launchError,
    }
  }
}

function evalWithTimeout(promiseFactory, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promiseFactory().finally(() => clearTimeout(timer)), timeout])
}

function failOf(err) {
  return { ok: false, error: err && err.name === 'TimeoutError' ? 'timeout' : 'internal', message: String((err && err.message) || err) }
}

export function apply(ctx, config = {}) {
  if (typeof globalThis !== 'undefined') {
    if (globalThis[ACTIVE_KEY]) throw new Error(`${NAME}: plugin is already applied to this host context`)
    globalThis[ACTIVE_KEY] = true
  }

  const cfg = resolveConfig(config)
  const session = new BrowserSession(cfg)

  /** webmcp_discover */
  function discoverTool() {
    return {
      name: 'webmcp_discover',
      description: 'WebMCP：打开目标网页并枚举该网站通过 W3C WebMCP 协议暴露的全部工具（名称/描述/输入Schema/来源层）。返回无损 JSON。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '目标网页地址（http/https）' },
        },
        required: ['url'],
      },
      output: { schema: JSON_OUT, render: jsonRender },
      execute: async ({ url }) => {
        if (!/^https?:\/\//i.test(url || '')) {
          return { ok: false, error: 'bad-url', message: 'url must start with http:// or https://' }
        }
        return session.discover(url)
      },
    }
  }

  /** webmcp_invoke */
  function invokeTool() {
    return {
      name: 'webmcp_invoke',
      description: 'WebMCP：在目标网页上调用一个站点暴露的 WebMCP 工具（先用 webmcp_discover 获取工具名与参数 Schema），返回工具的结构化结果。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '目标网页地址（工具所在的页面）' },
          tool: { type: 'string', description: 'WebMCP 工具名' },
          args: { type: 'object', description: '工具入参对象（遵循其 inputSchema）' },
        },
        required: ['url', 'tool'],
      },
      output: { schema: JSON_OUT, render: jsonRender },
      execute: async ({ url, tool, args }) => {
        if (!/^https?:\/\//i.test(url || '')) {
          return { ok: false, error: 'bad-url', message: 'url must start with http:// or https://' }
        }
        return session.invoke(url, tool, args)
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
          path: '/webmcp/status',
          handler: (_req, res) => {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
            res.end(JSON.stringify({
              plugin: NAME,
              version: VERSION,
              browser: session.status(),
              config: { headless: cfg.headless, navigationTimeoutMs: cfg.navigationTimeoutMs, invokeTimeoutMs: cfg.invokeTimeoutMs },
            }))
          },
        }),
      ]
      return () => disposers.forEach((d) => d())
    }, `${NAME}: http routes`)
  })

  ctx.effect?.(() => () => {
    void session.close()
    if (typeof globalThis !== 'undefined') delete globalThis[ACTIVE_KEY]
  }, `${NAME}: browser lifecycle`)
}

export { NAME as name, VERSION as version }

export default { name: NAME, version: VERSION, apply, resolveConfig, findChromium }
