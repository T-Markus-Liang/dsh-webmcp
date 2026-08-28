/**
 * In-process HTTP fixture for the dsh-webmcp e2e tests.
 *
 * Serves two pages over node:http with `cache-control: no-store`:
 *
 *   - `/`           → the home page, which exposes three WebMCP site tools:
 *                     `echo` and `add` via `window.webmcp.tools`, plus
 *                     `pageTitle` via `navigator.modelContext`.
 *   - `/form-only`  → a declarative HTML-form exposure (`data-webmcp-tool="lookup"`),
 *                     with an `input[name=q]` field and a `[data-webmcp-result]` node.
 *
 * Because the page realm is generated per-request and the environment is
 * bootstrap-only (no `page.addInitScript`), nothing leaks between requests.
 */

import { createServer } from 'node:http'

/**
 * Home page that registers the three site tools.
 *
 * - `echo` / `add` are plain objects inside `window.webmcp.tools` (the
 *   de-facto polyfill registry surface).
 * - `pageTitle` is exposed via `Object.defineProperty(navigator, 'modelContext', …)`
 *   flagged `configurable: true` so repeated loads can redefine it, guarded by
 *   `if (!('modelContext' in navigator))` to avoid clobbering a host-provided
 *   implementation.
 */
function homeHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>WebMCP Fixture</title>
</head>
<body>
  <h1>WebMCP Fixture</h1>
  <div id="app">home</div>
  <script>
    (() => {
      const echo = {
        name: 'echo',
        description: 'Echo the supplied text back',
        inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
        execute: async (args) => ({ echo: String(args && args.text != null ? args.text : '') }),
      };
      const add = {
        name: 'add',
        description: 'Sum two numeric operands',
        inputSchema: {
          type: 'object',
          properties: { a: { type: 'number' }, b: { type: 'number' } },
          required: ['a', 'b'],
        },
        execute: async (args) => ({
          sum: Number(args && args.a != null ? args.a : 0) + Number(args && args.b != null ? args.b : 0),
        }),
      };
      const greet = {
        name: 'greet',
        description: 'Greet someone by name',
        inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
        execute: async (args) => ({ greeting: 'hi ' + String(args && args.name != null ? args.name : '') }),
      };
      const deleteAccount = {
        name: 'delete_account',
        description: 'Delete the current account (destructive)',
        inputSchema: { type: 'object', properties: {} },
        annotations: { destructiveHint: true, readOnlyHint: false },
        execute: async () => ({ deleted: true }),
      };
      window.webmcp = { tools: [echo, add, greet, deleteAccount] };

      const pageTitle = {
        name: 'pageTitle',
        description: 'Return the current document title',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => ({ title: document.title }),
      };
      if (!('modelContext' in navigator)) {
        // Polyfill/native-style mount: Map store + promise getTools (v0.2.1
        // coverage — the shape official impls actually use).
        const mcTools = new Map([['pageTitle', pageTitle]]);
        Object.defineProperty(navigator, 'modelContext', {
          value: {
            tools: mcTools,
            getTools() { return Promise.resolve(Array.from(mcTools.values())); },
          },
          configurable: true,
        });
      }

      // Second spec mount (v0.1.1): document.modelContext, mirroring the
      // official examples. A UNIQUE tool name proves both mounts are probed.
      // docTitle carries NO inline execute: exercising the v0.2.1
      // executeToolByName dispatch channel on a polyfill-style mount.
      const docTitle = {
        name: 'docTitle',
        description: 'Return document.title through the document.modelContext mount',
        inputSchema: { type: 'object', properties: {} },
      };
      if (!('modelContext' in document)) {
        const docTools = new Map([[docTitle.name, docTitle]]);
        Object.defineProperty(document, 'modelContext', {
          value: {
            tools: docTools,
            getTools() { return Promise.resolve(Array.from(docTools.values())); },
            executeToolByName(n, args) {
              const t = docTools.get(n);
              if (!t) return Promise.reject(new Error('unknown tool: ' + n));
              return Promise.resolve({ title: document.title });
            },
          },
          configurable: true,
        });
      }
    })();
  </script>
</body>
</html>`
}

/**
 * Declarative WebMCP form page. The submit handler writes the result into the
 * `[data-webmcp-result]` node (both `.value` and `.textContent`, to satisfy the
 * host's `out.value != null ? out.value : out.textContent` readback) and calls
 * `preventDefault()`.
 */
function formHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>WebMCP Form Fixture</title>
</head>
<body>
  <h1>WebMCP Form Fixture</h1>
  <form data-webmcp-tool="lookup" data-webmcp-description="Look up an entry">
    <label>Query <input name="q" type="text"></label>
    <button type="submit">Go</button>
  </form>
  <input data-webmcp-result type="text" readonly>
  <script>
    (() => {
      const form = document.querySelector('form[data-webmcp-tool="lookup"]');
      const result = document.querySelector('[data-webmcp-result]');
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const q = form.elements.namedItem('q').value;
        const v = 'lookup:' + q;
        result.value = v;
        result.textContent = v;
      });
    })();
  </script>
</body>
</html>`
}

/** The most recently started site; `stopSite()` closes it. */
let currentSite = null

/**
 * Start the fixture server on 127.0.0.1.
 *
 * @param {number} [port=0]  Listening port; 0 asks the OS for a free port.
 * @returns {Promise<{url: (path?: string)=>string, formUrl: (path?: string)=>string, port: number, close: ()=>Promise<void>}>}
 */
export function startSite(port = 0) {
  const server = createServer((req, res) => {
    res.setHeader('cache-control', 'no-store')
    res.setHeader('content-type', 'text/html; charset=utf-8')

    let pathname
    try {
      pathname = new URL(req.url, 'http://127.0.0.1').pathname
    } catch {
      pathname = '/'
    }

    if (pathname === '/.well-known/webmcp') {
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({
        version: 1,
        tools: [{
          name: 'wellKnownEcho',
          description: 'Declared via /.well-known/webmcp',
          inputSchema: { type: 'object', properties: { msg: { type: 'string' } } },
          annotations: { readOnlyHint: true, destructiveHint: false },
        }],
      }))
      return
    }

    if (pathname === '/' || pathname === '/index.html') {
      res.end(homeHtml())
    } else if (pathname === '/form-only') {
      res.end(formHtml())
    } else {
      res.statusCode = 404
      res.end('not found')
    }
  })

  const listening = new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      resolve(server.address().port)
    })
  })

  return listening.then((actualPort) => {
    const site = {
      port: actualPort,
      url: (path = '/') => `http://127.0.0.1:${actualPort}${path}`,
      formUrl: (p = '/form-only') => site.url(p),
      close: () => new Promise((resolve) => server.close(() => resolve())),
    }
    currentSite = site
    return site
  })
}

/**
 * Close the most recently started fixture site. Safe to call when no site is
 * active (resolves immediately). e2e tests call this in their `finally` block.
 */
export function stopSite() {
  const site = currentSite
  currentSite = null
  if (!site) return Promise.resolve()
  return site.close()
}
