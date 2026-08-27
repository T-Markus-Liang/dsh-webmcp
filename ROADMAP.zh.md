# dsh-webmcp Roadmap

> [English](ROADMAP.md)

成熟度目标：沿着 v0.x 线做工程硬化 → 稳定的 v1.0。

## 成熟度快照

评级方法：基于开发史实测证据。

| 维度 | 评分 | 依据 |
| --- | --- | --- |
| 可靠性 | 5/10 | 四类工具面均有调用级 e2e；真实站点验证面仍为 1 站。 |
| 工程质量 | 6/10 | v0.2.2：页内代码已落地为可 node --check 的独立文件（page-agent.js）。 |
| 安全 | 7/10 | v0.2.2：DNS 反重绑定守卫已发布；错误码矩阵已文档化。 |
| 生态 | 6/10 | v0.3.0：stdio MCP 网关已发布——任意 MCP 客户端可消费站点工具。 |
| 性能 | 6/10 | v0.4.0：按源池化并发 + 空闲回收。 |
| 可观测 | 7/10 | v0.5.0：JSONL 追踪 + 实时仪表盘 + 漂移检测。 |
| 开发者体验 | 5/10 | 尚无设置卡片。 |

## 已发布

- `v0.1.0` —— 四类工具面发现 + 调用
- `v0.1.1` —— 双挂载
- `v0.2.0` —— 内网防护 + 会话复用
- `v0.2.1` —— polyfill / 原生 `Map` + `Promise` + `executeToolByName` + `argsWarning` + 结果预算
- `v0.2.2` ——（进行中）page-agent 工程化 + form e2e + DNS 防护 + 错误分类
- `v0.3.0` —— stdio MCP 网关（夹具站真机证据：5 工具 `tools/list` + echo 调用回环 + unknown-tool isError）
- `v0.4.0` —— 按源会话池：并发、LRU 驱逐、空闲回收（池单测 9/9 + 双源并发 e2e）
- `v0.5.0` —— 可观测：JSONL 追踪 + /webmcp/dashboard + manifest 漂移检测

## Phase 1 · v0.2.2 —— 工程硬化（本周）

- `page-agent.js` 真实文件化。
- HTML-form 调用 e2e 首次覆盖。
- DNS-rebinding 防护 + 错误分类矩阵（`bad-url` · `private-host-blocked` · `timeout` · `tool-threw` · `dns-failed` · `navigate-failed`）。

验收：全套件绿 · `page-agent.js` 可通过独立 `node --check` · 错误码表进 README。

## Phase 2 · v0.3.0 —— stdio MCP 网关（质变项）✅ 已发布 2026-08-28

WebMCP 本质上是 MCP 的 Web 化；不桥接 MCP 生态，只做了一半。

交付物：
- `bin/dsh-webmcp-serve.mjs` —— JSON-RPC over stdio，`tools/list` ← discover、`tools/call` ← invoke。
- Manifest 缓存到 `~/.dsh-webmcp/manifests/`（TTL + ETag）。
- 任意 MCP 客户端（Claude Code / Codex）接入示例文档。

验收：Claude Desktop `mcp` 配置一键接入示例 · 真实站点 roundtrip 演示 · 网关模式复用同一 `BrowserSession` 管线。

## Phase 3 · v0.4.0 —— 并发与回收 ✅ 已发布 2026-08-28

- `BrowserSessionPool` —— 每 host 独立 context、并发 3、LRU。
- idle 30s 自动关闭 context。
- 进程退出钩子。

验收：3 个 URL 并发 discover 总耗时 < 串行 1.5×。

## Phase 4 · v0.5.0 —— 可观测 ✅ 已发布 2026-08-28

- JSONL trace 到 `~/.dsh-webmcp/trace/` —— 每行 `url` / `tool` / `duration_ms` / `outcome`。
- 设置卡片（`dsh.client`）可视化最近调用 + p50/p95 + 成功率。
- Manifest 漂移检测 —— 工具清单 diff 提醒。

## Phase 5 · v1.0.0 —— 稳定化

- Chrome OT 毕业跟踪。
- npm 发布（files 白名单已就绪）。
- 安全自查文档。
- 双语文档定稿。

## Track B —— 生态与运营（精简保留）

- 市场 PR #3481 已提交待合并。
- 挑战赛跟进。
- 真实站点探测数据集。

## Track C —— 非目标（原样保留）

不做账户自动化/验证码/凭证 · 不做通用抓取 · 不做登录态注入 —— 安全边界不变。

## 原则

每个版本必须带真实站点验证证据 · 数据驱动排序 · 规模递增但每版独立可用。
