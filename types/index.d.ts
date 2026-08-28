/**
 * dsh-webmcp public TypeScript contract (v1.3.0).
 *
 * Pure type declarations for the bridge API — no build chain required. Import
 * with `import type { ... } from 'dsh-webmcp/types'` (or `dsh-webmcp` once the
 * package is published; the `types`/`exports` map in package.json wires both).
 *
 * These intentionally mirror the runtime shapes in lib/index.js,
 * lib/readiness.mjs and lib/gateway.mjs. If you change a runtime shape here,
 * update this file (a dedicated review keeps them in sync).
 */

// ── Config ────────────────────────────────────────────────────

export interface BridgeConfig {
  /** Run the browser headless. Default true. */
  headless: boolean
  /** Navigation budget, ms. Clamped 5000–120000. Default 30000. */
  navigationTimeoutMs: number
  /** Invoke evaluation budget, ms. Clamped 1000–60000. Default 20000. */
  invokeTimeoutMs: number
  /** Explicit Chromium executable path override. */
  chromiumPath: string
  /** Allow loopback/private/link-local (and DNS-rebinding) targets. Default false. */
  allowPrivateHosts: boolean
  /** Same-URL session-reuse window, ms; 0 disables. Clamped 0–600000. Default 30000. */
  sessionTtlMs: number
  /** Result-size budget (bytes). Clamped 1000–200000. Default 12000. */
  maxResultChars: number
  /** Per-origin browser sessions, bounded pool. Clamped 1–8. Default 3. */
  maxSessions: number
  /** Idle session reclamation, ms; 0 disables. Clamped 0–600000. Default 30000. */
  idleTtlMs: number
  /** JSONL call tracing. Default true. */
  trace: boolean
}

export type BridgeConfigInput = Partial<BridgeConfig>

// ── Tool surfaces ────────────────────────────────────────────

export type ToolSurface =
  | 'navigator.modelContext'
  | 'document.modelContext'
  | 'window.webmcp'
  | 'html-form'
  | 'well-known'
  | (string & {})

export interface ToolAnnotations {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
  title?: string
}

export interface DiscoveredTool {
  name: string
  description: string
  inputSchema: Record<string, unknown> | null
  outputSchema?: Record<string, unknown> | null
  annotations?: ToolAnnotations | null
  surface: ToolSurface
}

// ── Discover result ───────────────────────────────────────────

export interface DiscoverMeta {
  navigations: number
  reused: boolean
  drift?: { added: string[]; removed: string[] }
  annotations?: ToolAnnotations
}

export interface DiscoverSuccess {
  ok: true
  url: string
  title: string
  count: number
  tools: DiscoveredTool[]
  _meta: DiscoverMeta
}

export interface DiscoverFailure {
  ok: false
  error: BridgeErrorCode
  message: string
}

export type DiscoverResult = DiscoverSuccess | DiscoverFailure

// ── Invoke result ─────────────────────────────────────────────

export interface InvokeSuccess {
  ok: true
  url: string
  tool: string
  result: unknown
  surface?: ToolSurface
  argsWarning?: string
  _meta?: Record<string, unknown>
}

export interface InvokeFailure {
  ok: false
  url: string
  tool: string
  error: BridgeErrorCode
  message: string
  annotations?: ToolAnnotations
}

export type InvokeResult = InvokeSuccess | InvokeFailure

// ── Error taxonomy (see README) ───────────────────────────────

export type BridgeErrorCode =
  | 'bad-url'
  | 'private-host-blocked'
  | 'dns-failed'
  | 'network'
  | 'timeout'
  | 'navigate-failed'
  | 'unknown-tool'
  | 'not-callable'
  | 'tool-threw'
  | 'confirm-required'
  | 'internal'

// ── Readiness (lib/readiness.mjs) ─────────────────────────────

export interface ReadinessResult {
  toolCount: number
  schemaComplete: number
  schemaCompleteness: number | null
  annotated: number
  annotationCoverage: number | null
  readOnly: number
  destructive: number
  score: number | null
}

export interface AggregateReadiness {
  origins: Array<ReadinessResult & { origin: string }>
  toolCount: number
  score: number | null
}

// ── Session / pool status ─────────────────────────────────────

export interface SessionStatus {
  launched: boolean
  launchedWith: string | null
  lastError: string | null
  stats: { navigations: number }
}

export interface PoolStatus {
  size: number
  maxSessions: number
  idleTtlMs: number
  stats: { acquired: number; evicted: number; reclaimed: number }
  hosts: Array<{ origin: string; lastUsed: number } & Partial<SessionStatus>>
}

// ── MCP gateway (lib/gateway.mjs) ─────────────────────────────

export interface GatewayManifestTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown> | null
  annotations?: ToolAnnotations
}

export interface GatewayListResult {
  tools: GatewayManifestTool[]
}

/** JSON-RPC error object (per the gateway protocol). */
export interface GatewayCallError {
  code: number
  message: string
}

// ── Exports (per package.json) ────────────────────────────────

export function findChromium(cfg: BridgeConfig): string | null
export function apply(ctx: Record<string, unknown>, config?: BridgeConfigInput): void

export const name: 'dsh-webmcp'
export const version: string
export function resolveConfig(config?: BridgeConfigInput): BridgeConfig
export function isPrivateHostname(hostname: string): boolean
export function createSession(config?: BridgeConfigInput): {
  discover(url: string, opts?: { refresh?: boolean }): Promise<DiscoverResult>
  invoke(url: string, tool: string, args?: Record<string, unknown>, opts?: { refresh?: boolean; confirm?: boolean }): Promise<InvokeResult>
  close(): Promise<void>
  status(): SessionStatus
  readiness(): DiscoveredTool[]
}
export function computeReadiness(tools: DiscoveredTool[]): ReadinessResult
export function aggregateReadiness(perOrigin: Record<string, DiscoveredTool[]>): AggregateReadiness
