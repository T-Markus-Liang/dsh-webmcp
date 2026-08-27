[English](ROADMAP.md)

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
