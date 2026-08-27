# dsh-webmcp Roadmap

> [中文](ROADMAP.zh.md)

Maturity target: engineering hardening through the v0.x line → a stable v1.0.

## Maturity snapshot

Ratings are grounded in empirical evidence gathered across the project's development history.

| Dimension | Score | Basis |
| --- | --- | --- |
| Reliability | 5/10 | All four surfaces now have invoke-path e2e; real-site breadth still 1 site. |
| Engineering quality | 6/10 | v0.2.2: in-page code is a real node --check-able file (page-agent.js). |
| Security | 7/10 | v0.2.2: DNS-rebinding guard shipped; documented error taxonomy. |
| Ecosystem | 6/10 | v0.3.0: stdio MCP gateway shipped — any MCP client can consume site tools. |
| Performance | 6/10 | v0.4.0: per-origin pooled concurrency + idle reclamation. |
| Observability | 2/10 | Only navigation counts today. |
| Developer experience | 5/10 | No settings card yet. |

## Shipped

- `v0.1.0` — four tool-surface discovery + invocation
- `v0.1.1` — dual-mount
- `v0.2.0` — private-network protection + session reuse
- `v0.2.1` — polyfill / native `Map` + `Promise` + `executeToolByName` + `argsWarning` + result budget
- `v0.2.2` — (in progress) page-agent engineering + form e2e + DNS protection + error classification
- `v0.3.0` — stdio MCP gateway (fixture site: 5 tools `tools/list` + echo call roundtrip + unknown-tool isError)
- `v0.4.0` — per-origin session pool: concurrency, LRU eviction, idle reclamation (pool unit 9/9 + two-origin concurrent e2e)

## Phase 1 · v0.2.2 — Engineering hardening (this week)

- Real file-ification of `page-agent.js`.
- First e2e coverage of HTML-form invocation.
- DNS-rebinding protection + error-classification matrix (`bad-url` · `private-host-blocked` · `timeout` · `tool-threw` · `dns-failed` · `navigate-failed`).

Acceptance: full suite green · `page-agent.js` passes a standalone `node --check` · error-code table lands in the README.

## Phase 2 · v0.3.0 — stdio MCP gateway (step-change item) ✅ shipped 2026-08-28

WebMCP is fundamentally MCP's Web-ification; without bridging into the MCP ecosystem, we've only completed half the job.

Deliverables:
- `bin/dsh-webmcp-serve.mjs` — JSON-RPC over stdio, `tools/list` ← discover, `tools/call` ← invoke.
- Manifest cache under `~/.dsh-webmcp/manifests/` (TTL + ETag).
- Drop-in example docs for any MCP client (Claude Code / Codex).

Acceptance: one-click Claude Desktop `mcp` config example · real-site roundtrip demo · gateway mode reuses the same `BrowserSession` pipeline.

## Phase 3 · v0.4.0 — Concurrency & reclamation ✅ shipped 2026-08-28

- `BrowserSessionPool` — per-host context, concurrency 3, LRU.
- Auto-close idle contexts after 30 s.
- Process-exit hook.

Acceptance: concurrent discovery of 3 URLs takes less than 1.5× the serial total.

## Phase 4 · v0.5.0 — Observability

- JSONL trace to `~/.dsh-webmcp/trace/` — one line per `url` / `tool` / `duration_ms` / `outcome`.
- Settings card (`dsh.client`) visualizing recent calls + p50/p95 + success rate.
- Manifest drift detection — tool-list diff alert.

## Phase 5 · v1.0.0 — Stabilization

- Chrome Origin-Trial graduation tracking.
- npm release (files allowlist already in place).
- Security self-review document.
- Bilingual docs finalized.

## Track B — Ecosystem & ops (condensed)

- Marketplace PR #3481 submitted, awaiting merge.
- Challenge follow-up.
- Real-site probe dataset.

## Track C — Non-goals (unchanged)

No account automation / captchas / credentials · no general-purpose scraping · no login-state injection — the security boundary stays fixed.

## Principles

Every release must ship with real-site validation evidence · data drives ordering · scale up incrementally, but each release is independently usable.
