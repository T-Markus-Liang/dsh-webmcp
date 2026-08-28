/**
 * dsh-webmcp site-side authoring kit (v1.5.0) — zero-dependency embeddable
 * snippet for website authors to expose site actions to AI agents.
 *
 * Include with one line (script tag at end of <body> or a module):
 *   <script src=".../webmcp-register.js"></script>
 *
 * Then expose a tool by calling:
 *   WebMCP.register({
 *     name: 'search_products',           // required, unique
 *     description: 'Search the catalog', // human-readable, agent-facing
 *     inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
 *     outputSchema: { type: 'object', properties: { count: { type: 'number' } } },
 *     annotations: { readOnlyHint: true },   // MCP ToolAnnotations (v1.1.0 passthrough)
 *     execute: async (args) => ({ count: queryYourDb(args.q) }),
 *   });
 *
 * Notes:
 * - Feature-detects BOTH spec mounts (document.modelContext and
 *   navigator.modelContext) — the exact position shifted between them in
 *   Chrome builds, so probing only one silently fails (CloudNSite's lesson).
 * - Falls back to a window.webmcp registry when no modelContext is available.
 * - No-op (returns false) on browsers with no WebMCP support — zero risk.
 * - Chrome Origin Trial: add <meta name="webmcp" content="..."> OR the OT token
 *   per the Chrome docs to enable native mount in stable Chrome.
 */
(function () {
  'use strict';
  if (window.__dshWebMCPKit) return; // idempotent
  window.__dshWebMCPKit = true;

  /** Both spec mounts are probed — either may be present depending on build. */
  function findModelContext() {
    try {
      if (typeof document !== 'undefined' && document && document.modelContext) return document.modelContext;
    } catch (_) {}
    try {
      if (typeof navigator !== 'undefined' && navigator && navigator.modelContext) return navigator.modelContext;
    } catch (_) {}
    return null;
  }

  async function register(def) {
    if (!def || typeof def.name !== 'string' || !def.name) return false;

    // Normalize annotations to MCP worst-case defaults (v1.1.0 guard relies
    // on destructiveHint being truthful — encourage authors to set it).
    const ann = def.annotations || {};
    const tool = {
      name: def.name,
      description: def.description || '',
      inputSchema: def.inputSchema || { type: 'object', properties: {} },
      ...(def.outputSchema ? { outputSchema: def.outputSchema } : {}),
      annotations: {
        readOnlyHint: ann.readOnlyHint === true,
        destructiveHint: ann.destructiveHint !== false, // worst-case: true unless author opts out
        idempotentHint: ann.idempotentHint === true,
        openWorldHint: ann.openWorldHint !== false,
        ...(ann.title ? { title: ann.title } : {}),
      },
      ...(typeof def.execute === 'function' ? { execute: def.execute } : {}),
    };

    // 1) Native modelContext (Chrome Origin Trial / polyfill).
    const mc = findModelContext();
    if (mc && typeof mc.registerTool === 'function') {
      try {
        const r = mc.registerTool(tool);
        if (r && typeof r.then === 'function') await r; // Chrome 151+ returns Promise<void>
        return true;
      } catch (_) {}
    }

    // 2) window.webmcp registry fallback (de-facto convention, probed by the bridge).
    try {
      if (typeof window.webmcp === 'undefined' || window.webmcp === null) window.webmcp = { tools: [] };
      if (!Array.isArray(window.webmcp.tools)) window.webmcp.tools = [];
      window.webmcp.tools.push(tool);
      return true;
    } catch (_) {}

    return false; // no WebMCP support — silent no-op
  }

  window.WebMCP = window.WebMCP || {};
  window.WebMCP.register = register;
})();
