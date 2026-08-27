# dsh-webmcp Roadmap

> English below / [中文在后](#中文)

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

# 中文

## 当前位置

与英文表一致：`v0.1.0` 四层面发现调用、`v0.1.1` 双挂载与启动器回退、`v0.2.0`
内网防护与会话复用均已发布。

愿景一句话：**让每一个 DeepSeek Harness 的 agent 都听得懂讲 WebMCP 的网站**——
先做无头桥，再做其他 MCP 客户端都能搭的网关，最终与浏览器原生实现平起平坐。

## 轨道 A —— 能力阶梯

### v0.3.0 · stdio MCP server 网关模式
把发现的站点工具包装成标准 **stdio MCP server**，让任何会说 MCP 的客户端直接复用：

- 手写 JSON-RPC 2.0 帧（不引第三方 SDK）。
- 发现结果缓存到 `~/.dsh-webmcp/manifests/<host>.json`，重启秒开。
- 验收标准：`tools/list` 返回夹具四工具；`tools/call` 复用与 DSH 工具相同的页面域调用器；异常路径返回 JSON-RPC 错误。
- 风险：页面刷新导致的 Schema 漂移——启动时重扫 + manifest 哈希不一致报错。

### v0.4.0 · 可选的 CDP 附着真实浏览器
通过 `--remote-debugging-port` 附着到用户已登录的真实 Chrome，继承会话状态：

- 严格可选：配置 `attachUrl` 才生效；v0.2 内网防护继续对第三方目标生效。
- 写操作优先仍走页面自身的 WebMCP 工具——目标是借会话态，不是开放任意遥控。
- 验收标准：附着模式跑通夹具往返；文档写清数据暴露模型与边界。
- 风险：用户可能低估“已登录上下文被读取”——默认关闭 + 显著文档警告 + 状态端点横幅提示。

### v0.5.0 · 韧性与诊断
- 官方 **polyfill 自动注入**：`webmcp-types` SDK 编写的站点在原生支持落地前即可工作。
- 失败诊断包：超时/报错时可选导出脱敏控制台日志，便于提 issue。
- 工具级耗时遥测进入 `/webmcp/status`。

### v1.0.0 · 稳定化门禁
锁定 SemVer、对照 W3C 参考行为集做一致性回归、安全自查报告、性能预算
（暖启动导航 p95 ≤ 5 秒）、插件内设置卡双语文案对齐。

## 轨道 B —— 生态与运维（持续）
发布自动化（tag → Release → npm 发布流水线）；市场存在感（截图/GIF/类别复核）；
规范跟踪（订阅上游 release 与 Chrome 试验转正节奏，小版本内适配）；CI 深度
（Linux runner 真机 e2e 泳道）。

## 轨道 C —— 加固清单
站点级持久允许/拒绝清单叠加在 v0.2 防护之上；超大结果截断预览；环境变量开关的
结构化调试日志。

## 非目标（维持不变）
驱动 Firefox/Safari/WebKit · 通用 UI 抓取式自动化 · 取代后端 MCP server ·
未经显式 opt-in 对已登录 profile 的静默自主操作。

---

## How to influence this

Open an issue with the `roadmap` label, or bring data: which real sites expose
WebMCP tools today, which invocation patterns fail, what latency you see.
Data moves versions faster than opinions.

要影响方向：带 `roadmap` 标签开 issue，或直接提供数据——哪些真实站点已暴露工具、
哪类调用失败、延迟如何。数据比观点更能推动版本。
