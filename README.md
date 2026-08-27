<!--
  Logo placeholder — replace with the dsh-webmcp logo.
  Suggested banner: a minimal Chromium + WebMCP glyph with the wordmark "dsh-webmcp".
-->

English | [中文](README.zh.md)

# dsh-webmcp

**dsh-webmcp** is a DeepSeek Harness plugin that lets an agent discover and invoke the site tools a website exposes through the W3C WebMCP protocol, using a built-in headless Chromium.

WebMCP is a W3C Web Agents Community Group standardization proposal ([github.com/webmachinelearning/webmcp](https://github.com/webmachinelearning/webmcp)). In 2026-08 OpenAI shipped site-tool support in the ChatGPT desktop built-in browser and launched a challenge around it; Google Chrome Labs also open-sourced `webmcp-tools`. This plugin brings that capability to a DeepSeek Harness agent without relying on an external browser or manual selector maintenance.

## Why: WebMCP vs. traditional automation

| Aspect | Traditional automation | WebMCP site tools |
| --- | --- | --- |
| How a site exposes actions | Hard-coded selectors and scripts you maintain | Protocol-declared surfaces (`navigator.modelContext`, `window.webmcp`, `form[data-webmcp-tool]`) |
| Discovery | Reverse-engineer the page | `webmcp_discover` returns the normalized tool list |
| Invocation | Replay clicks and typed input | `webmcp_invoke` runs the site's real tool function in-page |
| Consent | The site has no say in the call | The protocol requires site-side confirmation |
| Drift | Breaks on markup changes | Follows the site's own declared contract |

## Install

```bash
dsh plugin --profile web add github:T-Markus-Liang/dsh-webmcp
```

## MCP gateway (stdio)

The plugin also ships `bin/dsh-webmcp-serve.mjs`, a stdio MCP gateway that bridges a site's WebMCP tools to ANY MCP client (Claude Code/Desktop, Codex, …). Point it at a URL and the site's tools become a local MCP server any MCP client can consume natively.

```
dsh-webmcp-serve <url> [--allow-private-hosts] [--manifest-ttl-ms N] [--no-cache]
```

Client config example:

```json
{ "mcpServers": { "my-site": { "command": "node", "args": ["/path/to/dsh-webmcp/bin/dsh-webmcp-serve.mjs", "https://example.com/app"] } } }
```

Protocol: newline-delimited JSON-RPC 2.0 (MCP stdio) implementing `initialize` / `ping` / `tools/list` / `tools/call`. `tools/list` comes from page discover (dual-mount / Map / Promise / `executeToolByName` fully compatible); `tools/call` reuses the same `BrowserSession` pipeline. Manifests are disk-cached under `~/.dsh-webmcp/manifests/` (default TTL 300s; `--no-cache` disables). Diagnostics go to stderr only — stdout is the pure MCP channel. Private-network targets are refused by default (plugin parity).

## Quick start

The plugin registers two agent tools.

```yaml
# Discover the site tools a page exposes (agent tool-call; wrapper is illustrative)
agent:
  tool: webmcp_discover
  input:
    url: https://example.com
```

```yaml
# Invoke a discovered site tool with arguments (args is optional)
agent:
  tool: webmcp_invoke
  input:
    url: https://example.com
    tool: <name-from-discover>
    args:
      query: "Show the latest posts"
```

Both tools accept an optional `refresh` (boolean) parameter: forces re-navigation. Invocations may return an `argsWarning` field listing required args you omitted (per the tool's `inputSchema.required`).

## Configuration

All options are optional and are set under the `config` block in `cordis.patch.yml`.

| Option | Default | Description |
| --- | --- | --- |
| `headless` | `true` | Run Chromium headless. |
| `navigationTimeoutMs` | `30000` | Timeout for navigating to the page, in milliseconds. |
| `invokeTimeoutMs` | `20000` | Timeout for a single tool invocation, in milliseconds. |
| `chromiumPath` | `""` | Explicit path to a Chromium executable; overrides automatic resolution. |
| `allowPrivateHosts` | `false` | When false (default), URLs targeting loopback/private networks (localhost, 127.0.0.0/8, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1, fc00::/7, *.local, *.internal) are rejected — protects intranet from prompt-injected scans. Set true for local development fixtures. |
| `sessionTtlMs` | `30000` | If a tool targets the exact URL navigated recently (within TTL), navigation is skipped and the live page is reused. Set 0 to always navigate. A `refresh: true` per-call override forces navigation. |
| `maxResultChars` | `12000` | Tool results serialized above this size are truncated to a `{ truncated, totalBytes, preview, hint }` envelope — protects the agent's context window from huge outputs. |
| `maxSessions` | `3` | Per-origin browser sessions, bounded pool. LRU eviction beyond capacity (1-8). |
| `idleTtlMs` | `30000` | Idle sessions (their browsers) are closed after this; 0 disables reclamation. |

Since v0.1.1 tool discovery probes BOTH spec mounts — `navigator.modelContext` and `document.modelContext` — alongside `window.webmcp` and declarative `<form data-webmcp-tool>` elements. Since v0.2.1 it also understands polyfill/native storage shapes (Map-backed tool stores, promise-returning `getTools()`) and routes calls through the mount's own `executeToolByName` when a registered entry carries no inline function.

## Chromium resolution order

When choosing a Chromium executable, the plugin tries, in order:

1. `config.chromiumPath`
2. Environment variable `DSH_WEBMCP_CHROMIUM`
3. Playwright `ms-playwright` cache scan
4. `channel: 'chrome'` (system Chrome)

## HTTP status endpoint

```http
GET /webmcp/status
```

```json
{
  "plugin": "dsh-webmcp",
  "version": "0.1.0",
  "browser": { "launched": true },
  "config": {}
}
```

## Scope & relationship to the W3C proposal

WebMCP itself is standardizing fast: **Chrome 149** and **Edge 150** ship it behind an
Origin Trial today, **ChatGPT Desktop** supports site tools natively, and Brave (Leo)
ships an experimental integration. Firefox and Safari have only filed standards
positions so far.

This plugin drives any locally available **Chromium-family** binary (see the
resolution chain below). It deliberately does **not** support driving Firefox or
Safari.

Honest positioning: the W3C proposal lists *headless browsing* and *fully
autonomous agents* among its non-goals — its vision is human-in-the-loop use
inside an agent-capable browser. This plugin is a pragmatic transition bridge
and a site-debugging tool: it lets harnesses without such a built-in agent reach
sites that already expose WebMCP tools today. For the full collaborative UX,
prefer native implementations once your browser ships them.

## Security

- Site JavaScript runs only inside an isolated, one-time headless profile; no user login state is ever reused.
- Tool invocation is explicitly initiated by the user through the agent — never silently in the background.
- The WebMCP protocol itself requires site-side user confirmation, the same model ChatGPT's site tools follow.
- Intranet shield — private-network targets are refused by default even if a prompt tricks the agent into pointing at them.

## Error taxonomy

Every tool result carries an `error` code on failure (and `argsWarning` on
missing required args). Host-side codes come from the bridge itself:

| code | meaning |
| --- | --- |
| `bad-url` | URL lacks an `http(s)://` scheme |
| `private-host-blocked` | target is loopback/private/link-local — **or resolves to one** (DNS-rebinding guard, v0.2.2) |
| `dns-failed` | hostname did not resolve |
| `network` | connection refused/reset/unreachable |
| `timeout` | navigation or evaluation exceeded its budget |
| `navigate-failed` | other navigation failure |
| `internal` | unexpected bridge failure |

Page-side codes come from the injected agent: `unknown-tool` (no such tool on
the page), `not-callable` (tool has no callable implementation), `tool-threw`
(the tool itself threw — message and truncated stack included).

## Roadmap

Condensed; full ladder with acceptance criteria lives in [ROADMAP.md](ROADMAP.md).

| Version | Theme | Status |
| --- | --- | --- |
| v0.2.0 | private-network shield + session reuse | ✅ shipped |
| v0.2.1 | polyfill/native runtime compat + argsWarning + result budget | ✅ shipped |
| v0.2.2 | page-agent engineering + DNS guard + error taxonomy | ✅ shipped |
| v0.3.0 | stdio MCP server gateway mode | ✅ shipped |
| v0.4.0 | per-origin session pool: concurrency + LRU + idle reclamation | ✅ shipped |
| later  | polyfill auto-injection, diagnostics bundle, dsh-browser interop | exploratory |

## License

MIT
