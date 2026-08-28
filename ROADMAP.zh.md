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
| 开发者体验 | 7/10 | v0.5.0 实时仪表盘 + 真实站点数据集 + 安全自查文档；npm 发布待授权。 |

## 已发布

- `v0.1.0` —— 四类工具面发现 + 调用
- `v0.1.1` —— 双挂载
- `v0.2.0` —— 内网防护 + 会话复用
- `v0.2.1` —— polyfill / 原生 `Map` + `Promise` + `executeToolByName` + `argsWarning` + 结果预算
- `v0.2.2` —— page-agent 工程化 + form e2e + DNS 防护 + 错误分类
- `v0.3.0` —— stdio MCP 网关（夹具站真机证据：5 工具 `tools/list` + echo 调用回环 + unknown-tool isError）
- `v0.4.0` —— 按源会话池：并发、LRU 驱逐、空闲回收（池单测 9/9 + 双源并发 e2e）
- `v0.5.0` —— 可观测：JSONL 追踪 + /webmcp/dashboard + manifest 漂移检测
- `v1.0.0` —— 稳定化：安全自查、真实站点数据集、OT 跟踪（npm 发布待授权）
- `v1.1.0` —— agent 接口对齐：annotations 透传 + 破坏性护栏 + well-known 探测
- `v1.2.0` —— 推送（tools/list_changed）+ outputSchema 透传 + 仪表盘就绪度与测试器
- `v1.3.0` —— 契约与打磨：`types/index.d.ts` TS 契约包、elicitation 评估（暂缓）、npm 发布待授权

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

## Phase 5 · v1.0.0 —— 稳定化 ✅ 已发布 2026-08-28（npm 发布待 registry 授权）

- Chrome OT 毕业跟踪。
- npm 发布（files 白名单已就绪）。
- 安全自查文档。
- 双语文档定稿。

## 市场现实（2026-08-28 调研）

- 规范仍是 W3C 社区组草案、不在 Standard Track；仅 Chrome 149+ Origin Trial；**WebKit 正式反对**，Mozilla 中立；真实部署 ≈ 0。
- **ChatGPT Desktop 站点工具已于 2026-08-26 上线**（自动发现、逐次确认、地址栏只读/变更指示）——首个大众级消费者。
- 商用层正在把**就绪度与可观测**货币化（web-mcp.net 的就绪评分/测试服务 $49/月起）——我们的仪表盘是免费开源的对位答案。
- 定位结论：WebMCP 是**渐进增强通道**而非唯一路径；MCP 保持为基线契约。

## 与生态的差距分析（2026-08-28 调研）

已对齐项：双挂载特性检测（CloudNSite 血泪第一课——我们 v0.1.1 起就做到）· 复用 MCP 词表的薄网关（Cloudflare 同款哲学）· 可观测层 · 无人文档化的安全加固（SSRF + DNS 反重绑定）。

| 差距 | 来源 | 修复阶段 |
| --- | --- | --- |
| 工具 annotations（readOnly/destructive/idempotent/openWorld 提示）未透传 | MCP 2025-03-26 规范 | v1.1.0 |
| 无 `/.well-known/` 探测（curl 可发现的自描述） | IETF 草案 + freeCodeCamp 实践 | v1.1.0 |
| 漂移检测靠轮询；无 `tools/list_changed` 推送 | MCP 订阅模型 | v1.2.0 |
| `outputSchema`/`structuredContent` 未透传 | MCP 2025-06-18 规范 | v1.2.0 |
| 仪表盘只读；商用竞品在卖交互式就绪度测试 | web-mcp.net $49/月 | v1.2.0 |
| 桥接 API 无 TS 类型契约 | @mcp-b/webmcp-types | v1.3.0 |
| elicitation（input_required 往返）未评估 | MCP 2026-07-28 MRTR | v1.3.0（评估） |

## Phase 6 · v1.1.0 —— agent 接口对齐 ✅ 已发布 2026-08-28

- **annotations 透传**：discover 暴露每个工具的 `annotations`（readOnlyHint/destructiveHint/idempotentHint/openWorldHint）；网关映射进 `tools/list`。
- **破坏性护栏**：调用标注 `destructiveHint`（或未标注按最坏假定）的工具必须显式 `confirm: true`，否则返回 `confirm-required` 及注解摘要。
- **well-known 探测**：discover 增加第五面——`/.well-known/webmcp` 与 `/.well-known/mcp.json`（surface 记为 `'well-known'`）。

验收：Persona 演示站工具可见 annotations · 破坏性护栏单测 + e2e · well-known 夹具路由探测通过。

## Phase 7 · v1.2.0 —— 推送与就绪度 ✅ 已发布 2026-08-28

- **list_changed 推送**：网关声明 `tools.listChanged: true`；manifest 漂移时主动发 `notifications/tools/list_changed`。
- **outputSchema 透传**：discover 暴露 `outputSchema`；截断信封保留结构化字段、只裁人话文本。
- **仪表盘就绪度视图**：按源就绪度指标（工具数、schema 完整度、注解覆盖率）+ 交互式调用测试器（商用扫描器收费的功能）。

验收：漂移 → 网关 e2e 实时收到通知 · 仪表盘页面完成夹具站调用往返。

## Phase 8 · v1.3.0 —— 契约与打磨 ✅ 已发布 2026-08-28

- `dsh-webmcp-types` TS 契约包（discover 结果 / invoke 载荷 / 错误码）。
- 对照真实网关客户端评估 elicitation（`resultType: "input_required"` + `requestState`）；确有客户端受益才实现。—— 评估结论：暂缓（见 CHANGELOG 1.3.0）。
- npm 发布（待 registry 授权）、市场收录跟进。

## Phase 9 · v1.4.0 —— 网关传输与远程化

- 网关增加 HTTP/SSE 传输（当前仅 stdio）→ 一个网关进程经局域网/tailscale 服务多个 MCP 客户端；远程暴露可选 bearer token。
- 在既有按源分片池之上支持多客户端并发。

验收：两个远程 MCP 客户端经同一网关并发驱动同一站点；无 token 请求被拒。

## Phase 10 · v1.5.0 —— 站点侧接入套件（生态最大缺口）

- 面向站点作者的最小 `registerTool` 嵌入片段：双挂载特性检测（document + navigator）、不支持浏览器零副作用、鼓励注解、origin-trial meta 指引。
- `dsh-webmcp-serve --check <url>` 就绪度审计 CLI（基于 lib/readiness.mjs）——开源的「agent 就绪度扫描器」。
- 官方演示站（GitHub Pages）暴露真实带注解工具——自狗粮 + 给所有 WebMCP 客户端一个永久可发现的目标。

验收：首次接入的站点作者仅凭该套件在 10 分钟内完成从 0 到可发现、注解完整的工具。

## Phase 11 · v1.6.0 —— 策略分层与规范跟踪

- 注解策略配置（`policy: { readOnly:'auto', destructive:'confirm', unknown:'ask' }`），叠加在 v1.1.0 护栏之上。
- 声明式 API 跟踪（webmachinelearning/webmcp #22 explainer）：规范落地声明式属性时扩展 html-form 面。
- Chrome OT 毕业：原生挂载进稳定版时更新双挂载优先级与文档。
- 网关客户端文档化 input_required 支持时重新评估 elicitation。

## Track B —— 生态与运营（精简保留）

- 市场 PR #3481 已提交待合并。
- 年龄闸门：仓库满 1 天后重触 Submission gate（上次检查：仅剩年龄规则）。
- 竞品观察：mcp-b polyfill（月下载 179k）是事实参考实现——每月跟踪其 API 漂移。
- 就绪度扫描器位：web-mcp.net 以 $49/月变现就绪度测试——v1.2.0 仪表盘就绪度视图是开源对位。
- Chrome OT 毕业跟踪：每个 Chrome 稳定版里程碑复验双挂载探测；OT 结束后原生挂载成为默认路径
- 挑战赛跟进。
- 真实站点探测数据集。

## Track C —— 非目标（原样保留）

不做账户自动化/验证码/凭证 · 不做通用抓取 · 不做登录态注入 —— 安全边界不变。

## 原则

每个版本必须带真实站点验证证据 · 数据驱动排序 · 规模递增但每版独立可用。
