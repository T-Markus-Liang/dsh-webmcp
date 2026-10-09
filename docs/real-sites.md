# Real-site WebMCP probing dataset

Probed with dsh-webmcp's own discovery pipeline (headless Chromium, Chrome for Testing 149). Last full re-probe: **2026-08-30** (dsh-webmcp v1.5.0, loaded in the web profile).

| Site | Result | Notes |
| --- | --- | --- |
| https://web-mcp.net | 0 tools | Marketing landing page for a commercial "Web-MCP" product (unrelated to the W3C proposal despite the name) |
| https://cloudnsite.com (+ www) | 0 tools | Blog claims WebMCP integration; homepage exposes none (tools likely on app routes) |
| https://developers.openai.com/showcase/cubecade-rubiks/ | 0 tools standalone | Rubik's game registers tools only inside ChatGPT's embedded app context |
| https://mcp-1st-birthday-dental-chatgpt-app.hf.space/ | redirect → HF landing | Space sleeping/unreachable at probe time |
| https://ai-sdk-webmcp.persona-chat.dev | **5 tools** | search_products / view_product / add_to_cart / remove_from_cart / apply_promo via navigator.modelContext polyfill (Map store + promise getTools()); invoke round-trip verified |

## 2026-08-30 re-probe (v1.5.0, live in the web profile)

Verified through dsh-webmcp's own tools (`webmcp_discover` / `webmcp_invoke`) against the Persona site:

- **Discover** → 5 tools, each with full `inputSchema`, `annotations`, `surface=navigator.modelContext` (e.g. `view_product` read-only `readOnlyHint:true`; `add_to_cart` `readOnlyHint:false`).
- **Read invoke** → `search_products({query:"trail shoe"})` round-trip OK, 4 structured hits (SKU / brand / price / imageUrl).
- **Write invoke** → `add_to_cart({sku:"SHOE-001", quantity:2})` OK; cart → 2 items, subtotal $258; `_meta.annotations.readOnlyHint:false` honored (no destructive confirm gate triggered).

## Key findings
1. **Three coexisting exposure models**: W3C in-page modelContext mounts (what dsh-webmcp discovers); ChatGPT Apps SDK iframe registration (invisible to standalone visits); mcp-use style server-side bridging. A real-world bridge must handle all three eventually.
2. **Polyfill storage shapes differ from naive assumptions**: tools live in Map stores with promise-returning getTools(); registry entries may lack inline functions and require executeToolByName dispatch (v0.2.1 fixed exactly this, proven by the Persona site).
3. **Marketing pages expose nothing**: tool registration lives behind app routes or agent-context gates. Discovery hit rate on landing pages is ~0 by design of site authors.
4. **Coverage caveat (2026-08-30)**: only sites that expose W3C `modelContext` yield tools; general/marketing pages and ChatGPT-app-embedded tools are invisible to standalone discovery — a design constraint, not a defect.

## Reproduce
```
node bin/dsh-webmcp-serve.mjs https://ai-sdk-webmcp.persona-chat.dev
# then send newline-delimited JSON-RPC: {"jsonrpc":"2.0","id":1,"method":"tools/list"}
```
or within a dsh session: `webmcp_discover(url)`, then `webmcp_invoke(url, tool, args)`.

## Update policy
Monthly, or when new site intelligence arrives, re-probe and update this table (dataset-driven ROADMAP ordering). Last update: **2026-08-30**.
