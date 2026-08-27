# Security Self-Review — dsh-webmcp v1.0.0

## Threat model

1. **Prompt-injected agent instructed to scan intranet** — control: a default-deny private-host gate. `isPrivateHostname` rejects loopback / RFC1918 / link-local / unique-local (ULA) / `.local` / `.internal`; `gateUrl` fast-fails any such target with error `private-host-blocked`; a DNS-rebinding guard (`assertPublicTarget`) also blocks a hostname that *looks* public but resolves to a private address; `allowPrivateHosts` is an explicit opt-in escape hatch that defaults to off.

2. **Hostile page JavaScript attacking the host** — control: all tool work runs in an isolated, disposable headless Chromium profile built with a fresh `newContext()`/`newPage()` (no user cookies, no login state); the injected agent code is read-only tool enumeration plus an explicit, name-targeted invoke path only. Nothing executes automatically and no browser state is shared with the host process.

3. **Oversized tool outputs burning agent context** — control: a `maxResultChars` truncation envelope (default 12 000 chars). When a serialized tool result exceeds the budget the bridge returns a `{ truncated, totalBytes, preview, hint }` marker instead of the full payload, so the agent can refine its args rather than swallow a huge blob.

4. **Tool registry poisoning (fake tools claiming system powers)** — control: the bridge never auto-invokes anything. Every `webmcp_invoke` call is an explicit agent decision carrying the exact `url` + `tool` + `args`; the in-page finder resolves only the one named tool and refuses `unknown-tool`/`not-callable` for anything else; `argsWarning` surfaces schema violations (missing required args) instead of silently defaulting.

5. **Trace data leakage** — control: trace JSONL is written strictly locally to `~/.dsh-webmcp/trace/` (daily rotation), with no network egress, and is best-effort only — a missing/readonly trace directory must never break or error a tool call.

## Controls matrix

| Threat | Control | Enforcement point (lib/ file + function) | Test evidence (test file + assertion) |
|---|---|---|---|
| 1. Intranet scan | Default-deny private hosts (loopback/RFC1918/link-local/ULA/`.local`/`.internal`) + DNS-rebinding guard + `allowPrivateHosts` opt-in | `lib/index.js` `isPrivateHostname()`; `gateUrl()` (returns `{error:'private-host-blocked'}`); `assertPublicTarget()` (code `private-host-blocked`); `resolveConfig()` (`allowPrivateHosts` defaults `false`); both tools' `execute` call `gateUrl` first, and `BrowserSession._goto()` calls `assertPublicTarget` | `test/unit.test.mjs` — `isPrivateHostname: private / link-local / unique-local hit` (localhost/127/10/192.168/172.16/169.254/`[::1]`/`[fc..]`/`[fd..]`/`.local`/`.internal` ⇒ true); `isPrivateHostname: public hosts pass through` (example.com, api.deepseek.com, 172.32.0.1 ⇒ false); `isPrivateHostname: empty hostname fails closed` ('' ⇒ true); `resolveConfig: allowPrivateHosts defaults to false and honors true`. `test/e2e.test.mjs` — the loopback (127.0.0.1) fixture is only reachable because the harness explicitly passes `allowPrivateHosts:true` ("the v0.2 intranet shield MUST be explicitly relaxed for this harness"), proving the default-deny stance. |
| 2. Hostile page JS | Isolated disposable headless profile; no user cookies/login state; in-page code is read-only enumeration + explicit invoke only | `lib/index.js` `BrowserSession.ensureBrowser()` (`newContext()`/`newPage()`, `headless:true` by default, throwaway profile); `apply()` (registers only `webmcp_discover`/`webmcp_invoke`); `lib/page-agent.js` `dshDiscoverRun()` (read-only scan across surfaces); `dshInvokeInstall()` (defines `window.__dshWebMCPInvoke`, resolves only a name-targeted tool) | `test/unit.test.mjs` — `page-snippet: DISCOVER_SNIPPET is non-empty and mentions navigator.modelContext`; `page-snippet: INVOKE_INSTALL_SNIPPET ... installs __dshWebMCPInvoke`. `test/e2e.test.mjs` — real headless launch over real HTTP (`discover + invoke on the fixture site`), plus the `unknown-tool` and `argsWarning` paths; the syntactic isolation of the injected script is asserted by `node --check lib/page-agent.js` (per the `check` script in `package.json`). |
| 3. Oversized tool output | `maxResultChars` truncation envelope (default 12 000) | `lib/index.js` `resolveConfig()` (`maxResultChars` clamp [1 000..200 000], default 12 000); `BrowserSession.invoke()` (serialized-length check → `{truncated, totalBytes, preview, hint}`) | `test/e2e.test.mjs` — maxResultChars truncation envelope: `echo` with a 20 000-char arg ⇒ `result.truncated===true`, `totalBytes>12000`, `preview.length===12000`, `hint` present (added in v1.0.0 to close this gap). |
| 4. Tool registry poisoning | Never auto-invokes; every call is an explicit agent decision; `argsWarning` surfaces schema violations | `lib/index.js` `invokeTool()` (explicit `url`/`tool`/`args`, `gateUrl` fast-fail, no background dispatch); `lib/page-agent.js` `dshInvokeInstall()` (`findTool` resolves only the named tool; returns `unknown-tool`/`not-callable` otherwise; `argsWarning` on missing required args) | `test/e2e.test.mjs` — `invoke('nope')` ⇒ `{error:'unknown-tool', ok:false}`; `greet` with no args ⇒ `argsWarning` matches `/missing required args: name/`. `test/gateway.test.mjs` — unknown tool ⇒ `isError:true` + `error:'unknown-tool'`; `greet` ⇒ `argsWarning` matches `/missing required args: name/`. |
| 5. Trace data leakage | Local-only JSONL (`~/.dsh-webmcp/trace/`), no network egress, best-effort only | `lib/trace.mjs` `traceDir()` (`~/.dsh-webmcp/trace`, env `DSH_WEBMCP_TRACE_DIR` override); `traceEvent()` (never throws); `lib/index.js` discovers/invokes tag `traceEvent({kind:'discover'|'invoke'|'manifest-drift', ...})` (trace on by default) | `test/trace.test.mjs` — `traceDir honors the env override and falls back to home` (asserts `.dsh-webmcp/trace`); `traceEvent appends one parseable JSONL line with ts + fields`; `traceEvent twice → two lines; daily file naming`; `traceEvent creates a missing directory and never throws`; `traceEvent in a readonly directory stays silent (POSIX)`; `summarizeEvents aggregates only call kinds, exact percentiles`; `loadRecentEvents across daily files, maxLines, corrupt lines`. |

## Residual risks (honest list)

- Tool result content is produced by the site itself, so the content trust boundary is the site — consistent with any other tool call an agent makes (the bridge does not validate or sanitize returned payloads).
- HTML-form invokes trigger a real form submission on the target site (this is by design: `invoke` is an explicit action, and the form's `requestSubmit` path is exercised).
- Pooled browsers persist until the idle TTL elapses (default 30 s reclamation), so a spent navigation keeps a live browser alive briefly in the background.
- A future CDP-attached real browser (a ROADMAP exploration item) would widen the attack surface and must be reviewed separately before landing.

## Non-goals (per Track C)

No account automation / CAPTCHAs / credentials; no general-purpose crawling; no login-state injection.

## Audit trail

Every discover/invoke call appends one JSONL line `{ kind, url, tool?, durationMs, ok, error?, reused?, ts }` to `~/.dsh-webmcp/trace/YYYY-MM-DD.jsonl` (daily rotation, best-effort). The live view is at `/webmcp/dashboard` (plus `/webmcp/status`) with real-time aggregation; manifest drift across two discoveries of the same URL is emitted as its own `manifest-drift` event and surfaced independently on the dashboard.

## Review cadence

Re-read this file on every minor version bump; any new tool surface or attachment mode (e.g. CDP attach) must update the threat model first.
