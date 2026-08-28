# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Docs
- Added ROADMAP.md (EN) / ROADMAP.zh.md (ZH): capability ladder with
  acceptance criteria, ecosystem/ops track, hardening backlog. README
  roadmap sections condensed to a status table linking into them.

### Planned

- v0.4.0: opt-in CDP attach to the user's real browser
- later: polyfill auto-injection, diagnostics bundle, dsh-browser interop

## [1.2.0] - 2026-08-28

### Added
- MCP gateway advertises tools.listChanged:true; a client subscribing via
  notifications/subscribe receives notifications/tools/list_changed on
  manifest drift (notifications/unsubscribe opts out).
- outputSchema passthrough on discover results and gateway tools/list.
- Structured-preserving truncation: oversized results first trim long human
  text fields (text/description/message/summary) keeping structured fields
  intact, then fall back to the clipped envelope.
- Dashboard: Agent-readiness view (per-origin score, schema completeness,
  annotation coverage, read-only/destructive counts) + interactive Tool
  tester (POST /webmcp/tester). lib/readiness.mjs.

## [1.1.1] - 2026-08-28

### Fixed
- pool-e2e wall-time ratio assertion flaked under full-suite load (multiple
  test files launching Chromium concurrently). Ratio is now informational;
  a 6x catastrophe guard remains. v1.1.0 shipped with this red test.

## [1.1.0] - 2026-08-28

### Added
- Tool annotations passthrough (readOnlyHint/destructiveHint/idempotentHint/
  openWorldHint) across discover results and gateway tools/list.
- Host-side destructive guard: tools annotated destructiveHint:true require
  explicit confirm:true (invoke param; gateway: _meta.confirm) — otherwise
  confirm-required. Enforced against the per-URL discovery baseline, so page
  JS cannot bypass it.
- Well-known probing: discover additionally checks /.well-known/webmcp and
  /.well-known/mcp.json as a fifth surface (declaration-only).
- Error taxonomy: confirm-required.

## [1.0.0] - 2026-08-28

Stabilization release. Capability surface is frozen from v0.2.2→v0.5.1; this
release hardens the project around it.

### Added
- docs/security-review.md — full threat model, controls matrix with test
  evidence pointers, honest residual risks, review cadence.
- docs/real-sites.md — real-site WebMCP probing dataset (five sites probed
  with our own pipeline; three coexisting exposure models documented).
- Chrome Origin-Trial graduation watch (Track B): re-verify against each
  Chrome stable milestone.

### Notes
- npm publish is the only Phase-5 item pending (registry auth required).
- 46 tests: 23 unit + 11 trace + 9 pool + 3 real-browser e2e.

## [0.5.1] - 2026-08-28

### Fixed
- /webmcp/status now actually includes the stats summary block (the v0.5.0
  insertion landed in the dashboard handler which shares the same anchor line);
  config echo also reports the trace flag.

## [0.5.0] - 2026-08-28

### Added
- JSONL call tracing to ~/.dsh-webmcp/trace/YYYY-MM-DD.jsonl (daily rotation,
  strictly best-effort; DSH_WEBMCP_TRACE_DIR override; config trace:false
  disables).
- /webmcp/dashboard: self-refreshing HTML observability page (config, pool
  status, aggregate p50/p95/success-rate/avgMs, last 20 calls, drift events).
  /webmcp/status gains a stats summary block.
- Manifest drift detection: re-discovering a URL whose tool set changed
  yields _meta.drift {added, removed} plus a manifest-drift trace line.

## [0.4.0] - 2026-08-28

### Added
- BrowserSessionPool: per-origin sessions with bounded capacity
  (maxSessions, default 3), LRU eviction, and idle reclamation
  (idleTtlMs, default 30s, 0 disables; unref'd timers never block exit).
  Concurrent work across different sites now runs in parallel.
- /webmcp/status reports pool status (size, per-origin hosts, pool stats).
- Design tradeoff documented: one browser process per session buys full
  per-site storage isolation; capacity bounds the resource cost.

### Changed
- apply() internals: single shared session → origin-sharded pool.
  Same-origin TTL reuse semantics unchanged.

## [0.3.0] - 2026-08-28

### Added
- stdio MCP gateway: `bin/dsh-webmcp-serve.mjs` exposes a site's WebMCP tools
  to ANY MCP client (Claude Code/Desktop, Codex, …) — newline-delimited
  JSON-RPC 2.0 with initialize/ping/tools/list/tools/call. Reuses the exact
  BrowserSession pipeline behind the dsh plugin tools (dual-mount, Map/Promise
  stores, executeToolByName dispatch, argsWarning, result budget all carried).
- Manifest cache at ~/.dsh-webmcp/manifests/ (TTL 300s; --no-cache / --manifest-ttl-ms).
- `createSession(config)` public export for embedders.
- CLI flags: --allow-private-hosts (default-deny parity with the plugin).

## [0.2.2] - 2026-08-28

### Changed
- `lib/page-agent.js`: the in-page code is now a real standalone JavaScript
  file (node --check-able, lintable) instead of template-string injection —
  the string-embedding style caused brace-imbalance bugs during v0.2.1's
  patch cycle. `page-snippet.js` is a thin loader. Zero behavior change
  (19/19 real-browser e2e byte-equivalent before/after).

### Added
- DNS-rebinding guard: public-looking hostnames that RESOLVE to private
  addresses are blocked too (same `private-host-blocked` code).
- Documented error taxonomy; `err.code` now flows through `failOf`:
  bad-url / private-host-blocked / dns-failed / network / timeout /
  navigate-failed / unknown-tool / not-callable / tool-threw / internal.

### Tested
- HTML-form surface gains its first invoke-path assertions (discover exposes
  the declarative form's inputSchema; invoke fills fields, submits, and reads
  back `[data-webmcp-result]`).

## [0.2.1] - 2026-08-27

### Fixed
- Tool discovery/invoke on polyfill & native mounts whose `tools` is a Map and
  whose `getTools()` returns a Promise (Chrome 149 Origin-Trial shape) —
  previously these pages discovered zero tools.
- `findTool` async-scope regression introduced with the above (await inside a
  sync arrow broke every invoke with a SyntaxError).

### Added
- `executeToolByName` dispatch channel: polyfill/native registry entries
  without an inline function are now invokable.
- `argsWarning` on invoke results when required args (per inputSchema) are
  missing — no more silent empty-args calls.
- `maxResultChars` result-size budget (default 12000) with truncated envelope
  `{ truncated, totalBytes, preview, hint }`.

## [0.2.0] - 2026-08-27

### Added
- Private-network shield: loopback/private targets rejected unless
  `allowPrivateHosts: true` — mitigates prompt-injected intranet scanning.
- Same-URL session reuse inside `sessionTtlMs`; per-call `refresh: true`
  override; navigation counters surfaced via `GET /webmcp/status`.
### Changed
- `webmcp_discover` / `webmcp_invoke` accept optional `refresh` boolean.

### Security
- Default-deny for private network targets (see allowPrivateHosts).

## [0.1.1] - 2026-08-27

### Added
- Tool discovery now probes both spec mounts: `navigator.modelContext` AND
  `document.modelContext` (official examples mount there), on top of the
  existing `window.webmcp` and html-form surfaces.
- Launcher falls back across multiple local Chromium binaries/channels when
  the first choice fails; `GET /webmcp/status` reports `browser.launchedWith`.
- New "Scope & relationship to the W3C proposal" documentation section with
  the live browser-support matrix.

### Fixed
- package.json test script: explicit file list (node --test directory args
  break under Node v24).

## [0.1.0] - 2026-08-27

### Added

- Two agent tools: `webmcp_discover(url)` and `webmcp_invoke(url, tool, args?)`.
- Optional plugin configuration (`headless`, `navigationTimeoutMs`, `invokeTimeoutMs`, `chromiumPath`) via `cordis.patch.yml`.
- HTTP status probe endpoint `GET /webmcp/status`.
- Detection of the three WebMCP surfaces: `navigator.modelContext`, `window.webmcp`, and `form[data-webmcp-tool]`.
- Chromium executable resolution chain (`config.chromiumPath` → `DSH_WEBMCP_CHROMIUM` → Playwright cache scan → `channel: 'chrome'`).
