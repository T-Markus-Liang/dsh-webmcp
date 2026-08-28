/**
 * dsh-webmcp in-page agent — REAL JavaScript, injected verbatim into the
 * target page realm (no imports, no bundling). Previously this code lived as
 * template strings inside page-snippet.js; that made it un-lintable and
 * un-checkable, which produced brace-imbalance bugs in v0.2.1's patch cycle.
 * Since v0.2.2 it is a standalone file: `node --check lib/page-agent.js`
 * validates it, and page-snippet.js only concatenates + wraps it.
 *
 * Every function is idempotent and defensive: a hostile or half-broken page
 * must never break the bridge, and repeated injection never duplicates state.
 *
 * Surfaces scanned (per-tool precedence, top wins):
 *   1a. `navigator.modelContext`   — W3C WebMCP direction (Chromium).
 *   1b. `document.modelContext`    — the mount used by official examples /
 *                                      polyfills; scanned since v0.1.1.
 *   2.  `window.webmcp`            — polyfill / registry de-facto standard
 *                                      (webmachinelearning polyfill, mcp-b, …)
 *   3.  `<form data-webmcp-tool>`  — declarative HTML-form exposure.
 *   4.  `/.well-known/webmcp` + `/.well-known/mcp.json`  — well-known self-description (host-side).
 */

/** The spec mounts ModelContext on navigator OR document depending on
 *  implementation/version, so both mounts are probed. */
function dshCollectHosts() {
  const hosts = [];
  try {
    if (typeof navigator !== 'undefined' && navigator && navigator.modelContext) {
      hosts.push({ mc: navigator.modelContext, surface: 'navigator.modelContext' });
    }
  } catch (_) {}
  try {
    if (typeof document !== 'undefined' && document && document.modelContext) {
      hosts.push({ mc: document.modelContext, surface: 'document.modelContext' });
    }
  } catch (_) {}
  return hosts;
}

/** Tool-list extraction: array stores, Map stores (polyfill impl keeps
 *  by-name entries), sync tools() and promise-returning getTools(). */
async function dshToolsFromMc(mc) {
  if (!mc) return null;
  // tools may be an array OR a Map (polyfill impl stores by-name entries).
  if (Array.isArray(mc.tools)) return mc.tools;
  if (mc.tools instanceof Map) return Array.from(mc.tools.values());
  if (typeof mc.tools === 'function') {
    try { const l = mc.tools(); return Array.isArray(l) ? l : null; } catch { return null; }
  }
  if (typeof mc.getTools === 'function') {
    try { const l = await mc.getTools(); return Array.isArray(l) ? l : null; } catch { return null; }
  }
  return null;
}

/** Discover: enumerate WebMCP-exposed site tools across all four surfaces. */
async function dshDiscoverRun() {
  const out = [];
  const seen = new Set();
  const push = (t, surface) => {
    try {
      if (!t || typeof t.name !== 'string' || !t.name) return;
      if (seen.has(t.name)) return;
      seen.add(t.name);
      let schema = null;
      const raw = t.inputSchema || t.parameters || t.schema;
      if (raw && typeof raw === 'object') {
        try { schema = JSON.parse(JSON.stringify(raw)); } catch { schema = null; }
      }
      let annotations = null;
      if (t.annotations && typeof t.annotations === 'object') {
        try { annotations = JSON.parse(JSON.stringify(t.annotations)); } catch { annotations = null; }
      }
      let outputSchema = null;
      if (t.outputSchema && typeof t.outputSchema === 'object') {
        try { outputSchema = JSON.parse(JSON.stringify(t.outputSchema)); } catch { outputSchema = null; }
      }
      out.push({
        name: t.name,
        description: typeof t.description === 'string' ? t.description : '',
        inputSchema: schema,
        outputSchema,
        annotations,
        surface,
      });
    } catch (_) {}
  };

  // 1a/1b. Both ModelContext mounts (official examples use document.*).
  // Enumeration is async: polyfill/native impls expose Map stores and
  // promise-returning getTools().
  for (const { mc, surface } of dshCollectHosts()) {
    const list = await dshToolsFromMc(mc);
    if (Array.isArray(list)) for (const t of list) push(t && t.descriptor ? t.descriptor : t, surface);
  }

  // 2. window.webmcp
  try {
    const w = window.webmcp;
    if (w) {
      let list = null;
      if (Array.isArray(w)) list = w;
      else if (Array.isArray(w.tools)) list = w.tools;
      else if (w.registry instanceof Map) list = Array.from(w.registry.values());
      else if (typeof w.listTools === 'function') list = w.listTools();
      if (Array.isArray(list)) {
        for (const t of list) {
          if (!t) continue;
          if (typeof t === 'function' && t.webmcpMeta) { push(t.webmcpMeta, 'window.webmcp'); continue; }
          if (typeof t.toJSON === 'function' && typeof t.execute !== 'function') { push(t.toJSON(), 'window.webmcp'); continue; }
          push(t, 'window.webmcp');
        }
      }
    }
  } catch (_) {}

  // 3. Declarative HTML forms
  try {
    document.querySelectorAll('form[data-webmcp-tool]').forEach((f) => {
      const fields = [];
      f.querySelectorAll('input,select,textarea').forEach((el) => {
        if (!el.name) return;
        fields.push({ name: el.name, type: el.type || 'string', required: el.required === true });
      });
      push({
        name: f.getAttribute('data-webmcp-tool'),
        description: f.getAttribute('data-webmcp-description') || '',
        inputSchema: fields.length
          ? { type: 'object', properties: Object.fromEntries(fields.map((x) => [x.name, { type: x.type }])) }
          : null,
      }, 'html-form');
    });
  } catch (_) {}

  return { title: document.title, url: location.href, tools: out };
}

/**
 * Installer: defines `window.__dshWebMCPInvoke(name, args)` in the page realm.
 * Runs after every navigation (the page realm resets on navigation), so the
 * host re-runs this before each invoke. Returns true when installed.
 */
function dshInvokeInstall() {
  try {
    if (typeof window.__dshWebMCPInvoke === 'function') return true;

    window.__dshWebMCPInvoke = async (toolName, args) => {
      const findTool = async () => {
        // 1a/1b. Both ModelContext mounts.
        try {
          for (const { mc, surface } of dshCollectHosts()) {
            const list = await dshToolsFromMc(mc);
            if (!Array.isArray(list)) continue;
            const hit = list.find((t) => t && t.name === toolName);
            if (hit) {
              const schema = hit.inputSchema || null;
              const annotations = hit.annotations || null;
              if (typeof hit.execute === 'function') return { fn: hit.execute, surface, schema, annotations };
              if (typeof hit === 'function') return { fn: hit, surface, schema, annotations };
              if (typeof mc.executeToolByName === 'function') {
                return {
                  dispatch: async (n, a) => mc.executeToolByName(n, a),
                  surface: surface + '#executeToolByName',
                  schema,
                  annotations,
                };
              }
            }
          }
        } catch (_) {}
        // 2. window.webmcp
        try {
          const w = window.webmcp;
          if (w) {
            if (typeof w.callTool === 'function') {
              return { dispatch: (n, a) => w.callTool(n, a), surface: 'window.webmcp#callTool' };
            }
            let list = Array.isArray(w) ? w : Array.isArray(w.tools) ? w.tools : (w.registry instanceof Map ? Array.from(w.registry.values()) : null);
            if (Array.isArray(list)) {
              const hit = list.find((t) => t && ((typeof t === 'function' && t.webmcpMeta && t.webmcpMeta.name === toolName) || (t && t.name === toolName)));
              if (hit) {
                const schema = hit.inputSchema || null;
              const annotations = hit.annotations || null;
                if (typeof hit === 'function') return { fn: hit, surface: 'window.webmcp', schema, annotations };
                if (typeof hit.execute === 'function') return { fn: hit.execute.bind(hit), surface: 'window.webmcp', schema, annotations };
                if (typeof hit.handler === 'function') return { fn: hit.handler, surface: 'window.webmcp', schema, annotations };
                if (typeof hit.fn === 'function') return { fn: hit.fn, surface: 'window.webmcp', schema, annotations };
              }
            }
          }
        } catch (_) {}
        // 3. HTML form
        try {
          const f = document.querySelector('form[data-webmcp-tool="' + window.CSS.escape(toolName) + '"]');
          if (f) return { form: f, surface: 'html-form' };
        } catch (_) {}
        return null;
      };

      const found = await findTool();
      if (!found) return { ok: false, error: 'unknown-tool', message: 'no WebMCP tool named "' + toolName + '" on this page' };

      // Surface missing required args instead of silently passing {}.
      let argsWarning = null;
      try {
        const req = (found.schema && Array.isArray(found.schema.required)) ? found.schema.required : [];
        const missing = req.filter((k) => !(args && args[k] !== undefined && args[k] !== null && args[k] !== ''));
        if (missing.length) argsWarning = 'missing required args: ' + missing.join(', ');
      } catch (_) {}

      try {
        if (found.dispatch) {
          const __ret = { ok: true, result: await found.dispatch(toolName, args == null ? {} : args), surface: found.surface };
          if (argsWarning) __ret.argsWarning = argsWarning;
          return __ret;
        }
        if (found.form) {
          for (const k of Object.keys(args == null ? {} : args)) {
            const el = found.form.elements.namedItem(k);
            if (el) el.value = String(args[k]);
          }
          const ev = new Event('submit', { bubbles: true, cancelable: true });
          const notPrevented = found.form.dispatchEvent(ev);
          if (notPrevented && typeof found.form.requestSubmit === 'function') found.form.requestSubmit();
          await new Promise((r) => setTimeout(r, 300));
          const out = document.querySelector('[data-webmcp-result]');
          return { ok: true, result: out ? (out.value != null ? out.value : out.textContent) : '(form submitted)', surface: found.surface };
        }
        if (found.fn) {
          const __ret = { ok: true, result: await found.fn(args == null ? {} : args), surface: found.surface };
          if (argsWarning) __ret.argsWarning = argsWarning;
          return __ret;
        }
        return { ok: false, error: 'not-callable', message: 'tool "' + toolName + '" has no callable implementation on this page' };
      } catch (err) {
        return { ok: false, error: 'tool-threw', message: String((err && err.message) || err), stack: String((err && err.stack) || '').slice(0, 2000) };
      }
    };
    return true;
  } catch (_) {
    return false;
  }
}
