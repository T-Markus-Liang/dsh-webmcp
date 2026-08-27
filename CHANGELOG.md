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
