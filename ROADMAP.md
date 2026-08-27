# dsh-webmcp Roadmap

> [中文](ROADMAP.zh.md)

## Where we are

| Tag | Theme | Status |
| --- | --- | --- |
| `v0.1.0` | Discover + invoke site tools across four surfaces (navigator/document modelContext, window.webmcp, html-form) | ✅ shipped |
| `v0.1.1` | Dual-mount probing hardening; Chromium launcher fallback chain | ✅ shipped |
| `v0.2.0` | Private-network shield; same-URL session reuse; navigation stats | ✅ shipped |

Vision: **make any DeepSeek Harness agent fluent in websites that speak WebMCP** —
first as a headless bridge, then as a gateway other MCP clients can ride, and
eventually as a first-class citizen next to native browser implementations.

---

# English

## Track A — Capability ladder

### v0.3.0 · stdio MCP server gateway
Expose discovered site tools as a plain **MCP server over stdio**, so *any*
MCP-speaking client can consume them.

```bash
npx dsh-webmcp-serve https://example.com          # discovers, serves tools/list + tools/call
```

- Hand-rolled JSON-RPC 2.0 framing (no SDK dependency kept).
- Caches the last discovery result to disk under
  `~/.dsh-webmcp/manifests/<host>.json` so repeated starts are instant.
- Acceptance: `tools/list` returns the fixture's echo/add/pageTitle/docTitle
  set; `tools/call` round-trips through the same page-realm invoker used by the
  DSH tools; negative path returns JSON-RPC errors.
- Risk: schema drift between page reloads → mitigate with startup re-scan and
  `manifest-hash` mismatch error.

### v0.4.0 · opt-in CDP attach to your real browser
Optionally attach to an already-running Chrome started with
`--remote-debugging-port`, inheriting the user's live login state instead of a
throwaway profile.

- Strictly opt-in: `attachUrl: "http://127.0.0.1:9222"` in plugin config;
  the private-network shield from v0.2 keeps protecting third-party targets.
- Writes stay routed through the page's own WebMCP tools whenever possible —
  the goal is session state, not free-form remote control.
- Acceptance: fixture round-trip through attached Chrome; documentation of the
  data-exposure model and what the harness can/cannot reach.
- Risk: users may not grasp that their logged-in context is exposed → ship
  with loud docs warnings, disabled-by-default, and a one-line status banner
  in `/webmcp/status`.

### v0.5.0 · resilience & diagnostics
- Official **polyfill auto-injection**: pages authored against `webmcp-types`
  work even before the user's Chromium ships native support.
- Failure diagnostics bundle: on tool timeout/error optionally capture a
  redacted console log + DOM-free trace dump for bug reports.
- Per-tool wall-time telemetry surfaced in `/webmcp/status`.

### v1.0.0 · stabilization gate
Semver lock, conformance run against the W3C reference behavior set, security
self-review document, perf budgets (navigation p95 ≤ 5 s on warm start),
bilingual in-plugin settings parity.

## Track B — ecosystem & ops (continuous)
- **Release automation**: tag → GitHub Release notes → npm publish workflow.
- **Marketplace presence**: screenshots/GIF in README, category review, install
  counter sanity checks after each release.
- **Spec tracking**: watch `webmachinelearning/webmcp` releases and Chrome
  Origin-Trial graduation; adapt mounts/surfaces within a minor cycle.
- **CI depth**: real-browser e2e lane on Linux runners once Playwright browser
  provisioning lands in the workflow (today macOS-local only).

## Track C — hardening backlog
- Per-site persisted allowlist/denylist layered on the v0.2 shield.
- Result-size budgets (truncate huge tool outputs with a preview hash).
- Structured debug-log hook behind an env flag.

## Non-goals (unchanged)
Driving Firefox/Safari/WebKit · general-purpose UI scraping automation ·
replacing backend MCP servers · silent autonomy over a user's logged-in
profile without explicit opt-in.

---
