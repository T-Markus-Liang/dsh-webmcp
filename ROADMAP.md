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
| Observability | 7/10 | v0.5.0: JSONL trace + live dashboard + drift detection. |
| Developer experience | 7/10 | v0.5.0 live dashboard + docs/real-sites dataset + security self-review; npm publish pending. |

## Shipped

- `v0.1.0` — four tool-surface discovery + invocation
- `v0.1.1` — dual-mount
- `v0.2.0` — private-network protection + session reuse
- `v0.2.1` — polyfill / native `Map` + `Promise` + `executeToolByName` + `argsWarning` + result budget
- `v0.2.2` — page-agent engineering + form e2e + DNS protection + error classification
- `v0.3.0` — stdio MCP gateway (fixture site: 5 tools `tools/list` + echo call roundtrip + unknown-tool isError)
- `v0.4.0` — per-origin session pool: concurrency, LRU eviction, idle reclamation (pool unit 9/9 + two-origin concurrent e2e)
- `v0.5.0` — observability: JSONL trace + /webmcp/dashboard + manifest-drift detection
- `v1.0.0` — stabilization: security self-review, real-site dataset, OT watch (npm publish pending auth)
- `v1.1.0` — agent-interface alignment: annotations passthrough + destructive guard + well-known probing

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

## Phase 4 · v0.5.0 — Observability ✅ shipped 2026-08-28

- JSONL trace to `~/.dsh-webmcp/trace/` — one line per `url` / `tool` / `duration_ms` / `outcome`.
- Settings card (`dsh.client`) visualizing recent calls + p50/p95 + success rate.
- Manifest drift detection — tool-list diff alert.

## Phase 5 · v1.0.0 — Stabilization ✅ shipped 2026-08-28 (npm publish pending registry auth)

- Chrome Origin-Trial graduation tracking.
- npm release (files allowlist already in place).
- Security self-review document.
- Bilingual docs finalized.

## Market reality (researched 2026-08-28)

- Spec is still a W3C Community Group draft, not on the Standard Track; Chrome 149+ Origin Trial only; **WebKit formally opposes**, Mozilla neutral; real-world deployments ≈ 0.
- **ChatGPT Desktop site tools went live 2026-08-26** (auto-discovery, per-call confirmations, address-bar read/act indicator) — the first mass-market consumer.
- Commercial layer is monetizing **readiness & observability** (web-mcp.net charges $49/mo for readiness scoring/testing) — our dashboard is the free/open answer.
- Positioning consequence: WebMCP is a **progressive-enhancement channel**, not the sole path. Keep MCP as the baseline contract.

## Gap analysis vs the ecosystem (researched 2026-08-28)

Already aligned: dual-mount feature-detect (CloudNSite's #1 hard-won lesson — shipped since v0.1.1) · thin gateway reusing MCP vocabulary (Cloudflare's philosophy) · observability layer · security hardening nobody else documents (SSRF + DNS-rebinding guards).

| Gap | Source | Fix phase |
| --- | --- | --- |
| Tool annotations (readOnly/destructive/idempotent/openWorld hints) not surfaced | MCP 2025-03-26 spec, D-line | v1.1.0 |
| No `/.well-known/` probing (curl-able discovery) | IETF draft + freeCodeCamp practice | v1.1.0 |
| Drift detection is polling; no `tools/list_changed` push | MCP subscription model | v1.2.0 |
| `outputSchema`/`structuredContent` not passed through | MCP 2025-06-18 spec | v1.2.0 |
| Dashboard is read-only; commercial rivals sell interactive readiness testing | web-mcp.net $49/mo | v1.2.0 |
| No TS type contracts for the bridge API | @mcp-b/webmcp-types | v1.3.0 |
| Elicitation (input_required round-trip) unevaluated | MCP 2026-07-28 MRTR | v1.3.0 (evaluate) |

## Phase 6 · v1.1.0 — Agent-interface alignment ✅ shipped 2026-08-28

- **Annotations passthrough**: discover surfaces each tool's `annotations` (readOnlyHint/destructiveHint/idempotentHint/openWorldHint); gateway maps them into `tools/list`.
- **Destructive guard**: invoking a tool annotated `destructiveHint` (or unannotated, worst-case default) requires explicit `confirm: true`; otherwise returns `confirm-required` with the annotation summary.
- **Well-known probing**: discover additionally checks `/.well-known/webmcp` and `/.well-known/mcp.json` as a fifth surface (header `surface: 'well-known'`).

Acceptance: annotations visible on the Persona demo tools · destructive guard unit + e2e · well-known fixture route probed.

## Phase 7 · v1.2.0 — Push & readiness

- **list_changed push**: gateway advertises `tools.listChanged: true`; manifest drift on refresh emits `notifications/tools/list_changed`.
- **outputSchema passthrough**: discover surfaces `outputSchema`; truncation envelope keeps structured fields intact and only clips human text.
- **Dashboard readiness view**: per-origin readiness metrics (tool count, schema completeness, annotation coverage) + interactive invoke tester (the feature commercial scanners charge for).

Acceptance: drift → live notification in gateway e2e · tester round-trip on fixture from the dashboard page.

## Phase 8 · v1.3.0 — Contracts & polish

- `dsh-webmcp-types` TS contract package for the bridge API (discover result, invoke payload, error taxonomy).
- Evaluate elicitation (`resultType: "input_required"` + `requestState`) against real gateway clients; ship only if a client demonstrably benefits.
- npm publish (pending registry auth), marketplace listing follow-through.

## Track B — Ecosystem & ops (condensed)

- Marketplace PR #3481 submitted, awaiting merge.
- Competitive watch: mcp-b polyfill (179k monthly downloads) is the de-facto reference implementation — track its API drift monthly.
- Readiness-scanner niche: web-mcp.net monetizes readiness testing at $49/mo — our v1.2.0 dashboard readiness view is the open answer.
- Challenge follow-up.
- Real-site probe dataset.

## Track C — Non-goals (unchanged)

No account automation / captchas / credentials · no general-purpose scraping · no login-state injection — the security boundary stays fixed.

## Principles

Every release must ship with real-site validation evidence · data drives ordering · scale up incrementally, but each release is independently usable.
