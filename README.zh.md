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

## 配置

所有配置项均可选，统一写在 `cordis.patch.yml` 的 `config` 块中。

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `headless` | `true` | 以无头模式运行 Chromium。 |
| `navigationTimeoutMs` | `30000` | 页面导航超时时间（毫秒）。 |
| `invokeTimeoutMs` | `20000` | 单次工具调用超时时间（毫秒）。 |
| `chromiumPath` | `""` | Chromium 可执行文件的显式路径；优先级高于自动解析。 |

自 v0.1.1 起，工具发现会同时探测规范的两个挂载点——`navigator.modelContext` 与 `document.modelContext`——外加 `window.webmcp` 和声明式 `<form data-webmcp-tool>` 元素。

## Chromium 解析顺序

选择 Chromium 可执行文件时，插件按以下顺序依次尝试：

1. `config.chromiumPath`
2. 环境变量 `DSH_WEBMCP_CHROMIUM`
3. Playwright `ms-playwright` 缓存扫描
4. `channel: 'chrome'`（系统 Chrome）

## HTTP 状态端点

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

## 路线图

- **v0.2** — stdio MCP server 网关模式
- **v0.3** — 会话复用与 CDP 附着
- **v0.4** — polyfill 自动注入
- **dsh-browser** — 与 dsh-browser 互通

## License

MIT
