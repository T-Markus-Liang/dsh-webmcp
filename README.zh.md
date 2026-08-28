<!--
  Logo 占位 — 替换为 dsh-webmcp 的 logo。
  建议横幅：一款简洁的 Chromium + WebMCP 图形，配 wordmark「dsh-webmcp」。
-->

[English](README.md) | 中文

# dsh-webmcp

**dsh-webmcp** 是 DeepSeek Harness 插件，让 agent 借助内置的无头 Chromium，发现并调用网站依照 W3C WebMCP 协议对外暴露的站点工具。

WebMCP 是 W3C Web Agents 社区组的标准化提案（[github.com/webmachinelearning/webmcp](https://github.com/webmachinelearning/webmcp)）。2026-08，OpenAI 让 ChatGPT 桌面版内置浏览器支持站点工具并发起挑战赛，Google Chrome Labs 也开源了 `webmcp-tools`。本插件无需外部浏览器、也不用手工维护选择器，即可把这项能力带给 DeepSeek Harness 的 agent。

## 为什么：WebMCP 与传统自动化

| 方面 | 传统自动化 | WebMCP 站点工具 |
| --- | --- | --- |
| 站点如何暴露动作 | 靠你维护的硬编码选择器与脚本 | 协议声明的工具面（`navigator.modelContext`、`window.webmcp`、`form[data-webmcp-tool]`） |
| 发现 | 逆向分析页面 | `webmcp_discover` 直接返回归一化工具清单 |
| 调用 | 重放点击与键盘输入 | `webmcp_invoke` 在页面内执行站点自身的真实工具函数 |
| 同意 | 站点对调用毫无话语权 | 协议要求站点侧确认 |
| 漂移 | 页面一改就崩 | 跟随站点自己声明的契约 |

## 安装

```bash
dsh plugin --profile web add github:T-Markus-Liang/dsh-webmcp
```

## MCP 网关（stdio）

插件同时提供 `bin/dsh-webmcp-serve.mjs`，这是一个 stdio MCP 网关，把某网站对外暴露的 WebMCP 工具桥接给任意 MCP 客户端（Claude Code/Desktop、Codex 等）。指向一个 URL，站点工具即变成任何 MCP 客户端都能原生消费的本地 MCP server。

```
dsh-webmcp-serve <url> [--allow-private-hosts] [--manifest-ttl-ms N] [--no-cache]
```

客户端配置示例：

```json
{ "mcpServers": { "my-site": { "command": "node", "args": ["/path/to/dsh-webmcp/bin/dsh-webmcp-serve.mjs", "https://example.com/app"] } } }
```

协议：换行分隔 JSON-RPC 2.0（MCP stdio），实现 `initialize` / `ping` / `tools/list` / `tools/call`。`tools/list` 来自页面 discover（双挂载 / Map / Promise / `executeToolByName` 全兼容）；`tools/call` 复用同一 `BrowserSession` 管线。Manifest 磁盘缓存于 `~/.dsh-webmcp/manifests/`（默认 TTL 300s；`--no-cache` 关闭）。诊断只走 stderr——stdout 是纯 MCP 通道。私网目标默认拒绝（与插件一致）。

## 快速开始

该插件注册了 2 个 agent 工具。

```yaml
# 发现页面暴露的站点工具（agent 工具调用示例，外层包装仅为示意）
agent:
  tool: webmcp_discover
  input:
    url: https://example.com
```

```yaml
# 携带参数调用某个已发现的站点工具（args 可选）
agent:
  tool: webmcp_invoke
  input:
    url: https://example.com
    tool: <name-from-discover>
    args:
      query: "展示最新文章"
```

两个工具均接受可选参数 `refresh`(boolean)：强制重新导航。 调用结果可能携带 `argsWarning` 字段，提示你遗漏了该工具 `inputSchema.required` 中的必填参数。`webmcp_invoke` 还接受 `confirm`（boolean）：破坏性工具确认闸——annotations.destructiveHint 为 true 时必须显式传 true（宿主侧强制，页面不可绕过）。

## 配置

所有配置项均可选，统一写在 `cordis.patch.yml` 的 `config` 块中。

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `headless` | `true` | 以无头模式运行 Chromium。 |
| `navigationTimeoutMs` | `30000` | 页面导航超时时间（毫秒）。 |
| `invokeTimeoutMs` | `20000` | 单次工具调用超时时间（毫秒）。 |
| `chromiumPath` | `""` | Chromium 可执行文件的显式路径；优先级高于自动解析。 |
| `allowPrivateHosts` | `false` | 为 false（默认）时拒绝指向回环/私有网络的 URL（localhost、127/8、10/8、172.16/12、192.168/16、169.254/16、::1、fc00::/7、*.local、*.internal）——防止被提示注入诱导扫描内网。本地开发夹具请显式设 true。 |
| `sessionTtlMs` | `30000` | 若工具目标 URL 与近期导航完全一致（TTL 内），跳过重复导航直接复用当前页面；设为 0 表示每次都导航。单次调用可传 `refresh: true` 强制刷新。 |
| `maxResultChars` | `12000` | 工具结果序列化后超过该字节数时截断为 `{ truncated, totalBytes, preview, hint }` 信封——防止超大输出撑爆 agent 上下文。 |
| `maxSessions` | `3` | 按源（origin）划分的浏览器会话池上限；超出按 LRU 驱逐（1-8）。 |
| `idleTtlMs` | `30000` | 空闲会话（及其浏览器）超时自动关闭；0 表示禁用回收。 |
| `trace` | `true` | 调用追踪 JSONL 写入 `~/.dsh-webmcp/trace/`（按日轮转，失败静默）。设 false 关闭。 |

自 v0.1.1 起，工具发现会同时探测规范的两个挂载点——`navigator.modelContext` 与 `document.modelContext`——外加 `window.webmcp` 和声明式 `<form data-webmcp-tool>` 元素。自 v0.2.1 起进一步兼容 polyfill/原生实现的存储形态（Map 工具表、返回 Promise 的 `getTools()`），并在注册项无内联函数时自动经挂载点自身的 `executeToolByName` 分发调用。自 v1.1.0 起，discover 还会额外探测 `/.well-known/webmcp` 与 `/.well-known/mcp.json`（surface 记为 `well-known`），且每个工具条目都携带其 MCP `annotations`。

## Chromium 解析顺序

选择 Chromium 可执行文件时，插件按以下顺序依次尝试：

1. `config.chromiumPath`
2. 环境变量 `DSH_WEBMCP_CHROMIUM`
3. Playwright `ms-playwright` 缓存扫描
4. `channel: 'chrome'`（系统 Chrome）

## HTTP 状态与仪表盘

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

`GET /webmcp/dashboard` 提供每 5 秒自刷新的 HTML 观测页：
配置摘要、池状态、聚合指标（调用数 / 成功率 / p50 / p95 / 均值）、最近 20 次调用、
manifest 漂移事件。`/webmcp/status` 同步内嵌 `stats` 摘要。追踪按日写入
`~/.dsh-webmcp/trace/YYYY-MM-DD.jsonl`（可用 `DSH_WEBMCP_TRACE_DIR` 覆盖）。

**Manifest 漂移检测**：同一 URL 再次 discover 时若工具集合变化，结果携带
`_meta.drift = { added, removed }`（按源内存基线），并写入 `manifest-drift` 追踪行。

**就绪度端点**：`GET /webmcp/readiness` 返回 Agent 就绪度视图——按源的 `score`、schema 完整度、注解覆盖率，
以及 `readOnly` / `destructive` 计数（`score = 100 * (0.6 * schema + 0.4 * annotations)`）。同一仪表盘还提供
交互式 **Tool tester**（`POST /webmcp/tester` 表单）：选择已发现的工具、填写参数、勾选 `confirm` 复选框，即可
读回调用结果 JSON（`body: { url, tool, args, confirm }`）。这是对商用就绪度扫描器（web-mcp.net 收费 $49/月）的
免费开源对位答案。

## 范围说明：与 W3C 提案的关系

WebMCP 标准化进展迅速：**Chrome 149** 与 **Edge 150** 已通过 Origin Trial 上线实验支持，
**ChatGPT 桌面版**原生支持站点工具，Brave（Leo AI）提供实验性集成。Firefox 与 Safari
目前仅提交了标准立场议题。

本插件可驱动本地任意 **Chromium 家族**二进制（见下方解析链），刻意不支持驱动
Firefox 或 Safari。

诚实定位：W3C 提案将“无头浏览”与“全自主代理”列为非目标——其愿景是在具备内建
agent 的浏览器中实现人机协作。本插件是一个务实的过渡期桥接器与站点调试工具：
让尚无内建 agent 的 Harness 立即触达已暴露 WebMCP 工具的站点。完整的人机协作
体验，仍应期待并使用你浏览器未来的原生实现。

## 安全

- 站点 JavaScript 只运行在隔离的一次性无头 profile 中，绝不复用用户任何登录态。
- 工具调用由用户通过 agent 显式发起，绝不在后台静默执行。
- WebMCP 协议本身就要求站点侧用户确认，ChatGPT 的站点工具正是如此。
- 内网防护——即便提示注入诱导 agent 指向内网，默认也会拒绝该目标。

## 错误码

每次调用失败都会携带 `error` 码（缺少必填参数时附带 `argsWarning`）。宿主侧错误码：

| code | 含义 |
| --- | --- |
| `bad-url` | URL 缺少 http(s):// 协议头 |
| `private-host-blocked` | 目标为环回/内网/链路本地——**或解析到这类地址**（v0.2.2 DNS 反重绑定守卫） |
| `dns-failed` | 域名解析失败 |
| `network` | 连接被拒/重置/不可达 |
| `timeout` | 导航或页面求值超出预算 |
| `navigate-failed` | 其他导航失败 |
| `internal` | 桥接器自身异常 |
| `confirm-required` | 工具被标注 destructiveHint:true——需带 confirm:true 重新调用 |

页面侧错误码来自注入 agent：`unknown-tool`（页面无此工具）、`not-callable`（工具无可调用实现）、`tool-threw`（工具自身抛错，附消息与截断堆栈）。

## 路线图

此处为精简版；含验收标准的完整阶梯见 [ROADMAP.zh.md](ROADMAP.zh.md)。

| 版本 | 主题 | 状态 |
| --- | --- | --- |
| v0.2.0 | 内网防护 + 会话复用 | ✅ 已发布 |
| v0.2.1 | polyfill/原生运行时兼容 + argsWarning + 结果预算 | ✅ 已发布 |
| v0.2.2 | page-agent 工程化 + DNS 防护 + 错误码矩阵 | ✅ 已发布 |
| v0.3.0 | stdio MCP server 网关模式 | ✅ 已发布 |
| v0.4.0 | 按源会话池：并发 + LRU 驱逐 + 空闲回收 | ✅ 已发布 |
| v0.5.0 | 可观测：JSONL 追踪 + 仪表盘 + manifest 漂移 | ✅ 已发布 |
| v1.1.0 | annotations 透传 + 破坏性护栏 + well-known 探测 | ✅ 已发布 |
| v1.2.0 | 推送（tools/list_changed）+ outputSchema 透传 + 仪表盘就绪度与测试器 | ✅ 已发布 |
| 后续 | polyfill 自动注入、诊断包、dsh-browser 互通 | 探索中 |

## License

MIT
