/**
 * Trace & stats engine (v0.5.0).
 *
 * Every discover/invoke appends one JSONL line to
 * ~/.dsh-webmcp/trace/YYYY-MM-DD.jsonl (daily rotation). Tracing is
 * strictly best-effort: a readonly or missing directory must never break a
 * tool call. Tests override the directory via DSH_WEBMCP_TRACE_DIR.
 */
import { appendFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function traceDir() {
  return process.env.DSH_WEBMCP_TRACE_DIR || join(homedir(), '.dsh-webmcp', 'trace')
}

/**
 * Append one event line. Never throws.
 * event: { kind: 'discover'|'invoke'|'manifest-drift', url, tool?, durationMs?,
 *          ok?, error?, reused?, ... }
 */
export function traceEvent(event) {
  try {
    const dir = traceDir()
    mkdirSync(dir, { recursive: true })
    const day = new Date().toISOString().slice(0, 10)
    appendFileSync(join(dir, `${day}.jsonl`), JSON.stringify({ ts: Date.now(), ...event }) + '\n')
  } catch (_) {}
}

/** p-th percentile of an ALREADY-sorted numeric array; null when empty. */
export function percentile(sorted, p) {
  if (!sorted.length) return null
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[idx]
}

/**
 * Aggregate call events into headline stats.
 * events: [{ durationMs?, ok? }]
 * → { count, ok, fail, successRate, p50, p95, avgMs }
 */
export function summarizeEvents(events) {
  const calls = events.filter((e) => e && (e.kind === 'discover' || e.kind === 'invoke'))
  const durations = calls
    .filter((e) => typeof e.durationMs === 'number')
    .map((e) => e.durationMs)
    .sort((a, b) => a - b)
  const ok = calls.filter((e) => e.ok === true).length
  const fail = calls.filter((e) => e.ok === false).length
  return {
    count: calls.length,
    ok,
    fail,
    successRate: calls.length ? ok / calls.length : null,
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    avgMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
  }
}

/**
 * Load the most recent events across daily files (newest last).
 * Best-effort: unreadable/corrupt lines are skipped.
 */
export function loadRecentEvents({ dir = traceDir(), maxLines = 200 } = {}) {
  try {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .sort()
    const lines = []
    for (const f of files) {
      const text = readFileSync(join(dir, f), 'utf8')
      for (const line of text.split('\n')) if (line.trim()) lines.push(line)
    }
    return lines
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean)
      .slice(-maxLines)
  } catch (_) {
    return []
  }
}

/**
 * Manifest drift: compare tool-name sets between two discoveries.
 * → null when unchanged, else { added: [...], removed: [...] }.
 */
export function diffManifests(prevNames, currNames) {
  if (!Array.isArray(prevNames) || !Array.isArray(currNames)) return null
  const prev = new Set(prevNames)
  const curr = new Set(currNames)
  const added = currNames.filter((n) => !prev.has(n))
  const removed = prevNames.filter((n) => !curr.has(n))
  if (!added.length && !removed.length) return null
  return { added, removed }
}
