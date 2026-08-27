# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- Planned: gateway stdio mode …
- Planned: session reuse & CDP attach …

## [0.1.0] - 2026-08-27

### Added

- Two agent tools: `webmcp_discover(url)` and `webmcp_invoke(url, tool, args?)`.
- Optional plugin configuration (`headless`, `navigationTimeoutMs`, `invokeTimeoutMs`, `chromiumPath`) via `cordis.patch.yml`.
- HTTP status probe endpoint `GET /webmcp/status`.
- Detection of the three WebMCP surfaces: `navigator.modelContext`, `window.webmcp`, and `form[data-webmcp-tool]`.
- Chromium executable resolution chain (`config.chromiumPath` → `DSH_WEBMCP_CHROMIUM` → Playwright cache scan → `channel: 'chrome'`).
