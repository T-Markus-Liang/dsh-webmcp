# Contributing to dsh-webmcp

Thanks for your interest! This guide covers how to set up a dev environment, write code that fits the project, and open a clean pull request.

## Developer setup

```bash
git clone https://github.com/T-Markus-Liang/dsh-webmcp.git
cd dsh-webmcp
npm install   # installs deps incl. playwright-core (no browser download)
npm test      # run the unit test suite (no network / no real browser needed)
```

`npm i` pulls in `playwright-core` and is enough to get going. Playwright browsers are **not** downloaded by default: `playwright-core` does not ship or download browsers, and the plugin resolves a Chromium at runtime if one is needed.

## Code style

- **Pure ESM.** The package uses `"type": "module"` — write `import`/`export`, not `require`.
- **No build step.** `lib/` is both the source and the shipped artifact. What you write in `lib/` is what runs. There is no transpile/compile/bundle step and no `dist/` output — do not introduce one.
- Keep changes scoped and readable; prefer the simplest implementation that fully satisfies the requirement (no speculative abstractions).
- Match the surrounding style of `lib/index.js` and `lib/page-snippet.js`.

## Commit conventions

Use [Conventional Commits](https://www.conventionalcommits.org/). Prefixes relevant here:

- `feat:` — new capability
- `fix:` — a bug fix
- `docs:` — documentation
- `chore:` — maintenance, tooling, CI, dependencies

Examples:

```
feat: add webmcp_discover tool registration
fix: resolve chromium when DSH_WEBMCP_CHROMIUM is unset
docs: clarify WebMCP surface precedence
chore: pin playwright-core minor
```

## Pull request process

1. Branch off `main` with a descriptive name (e.g. `fix/chromium-resolution`).
2. Make focused commits that follow the commit conventions above.
3. Run `npm test` and `npm run check` locally and make sure they pass.
4. Open a PR with a clear title and a description that explains **what** changed and **why**.
5. Keep the diff small: one PR = one coherent change.

## Code of conduct

Be kind — by common community consensus, treat every contributor with respect, keep review feedback constructive, and don't make assumptions about intent.

***

# 中文版

感谢你对 dsh-webmcp 的关注！以下说明如何配置开发环境、写出契合项目的代码，以及提交干净的 PR。

## 开发环境

```bash
git clone https://github.com/T-Markus-Liang/dsh-webmcp.git
cd dsh-webmcp
npm install   # 安装依赖（含 playwright-core，不下载浏览器）
npm test      # 跑单元测试（无需网络 / 真实浏览器）
```

`npm i` 会拉入 `playwright-core`，足够起步。项目默认 **不会下载** Playwright 浏览器：`playwright-core` 本身不附带也不下载浏览器，如需浏览器会在运行时解析 Chromium。

## 代码风格

- **纯 ESM。** 包声明为 `"type": "module"`，请用 `import` / `export`，不要用 `require`。
- **无构建步骤。** `lib/` 既是源码也是产物。你在 `lib/` 里写的代码就是实际运行的代码；没有转译/编译/打包步骤，也没有 `dist/` 产物——请不要引入。
- 改动保持小而聚焦；优先选择最简单且完全满足需求的实现，不做投机性抽象。
- 与 `lib/index.js`、`lib/page-snippet.js` 的既有风格保持一致。

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)。本项目常用前缀：

- `feat:` —— 新能力
- `fix:` —— 修复缺陷
- `docs:` —— 文档
- `chore:` —— 维护、工具、CI、依赖

示例：

```
feat: add webmcp_discover tool registration
fix: resolve chromium when DSH_WEBMCP_CHROMIUM is unset
docs: clarify WebMCP surface precedence
chore: pin playwright-core minor
```

## PR 流程

1. 从 `main` 拉出描述性分支（如 `fix/chromium-resolution`）。
2. 按上述提交规范做聚焦提交。
3. 本地跑 `npm test` 与 `npm run check`，确认通过。
4. 提交 PR，标题清晰，描述说明**改了什么**以及**为什么**。
5. 保持 diff 精简：一个 PR 只做一处连贯改动。

## 行为准则

Be kind（友善）——按社区共识：尊重每位贡献者，评审意见保持建设性，不臆测他人意图。
