/**
 * Unit tests for the trace & stats engine (lib/trace.mjs). No browser needed.
 * Each test isolates itself via a fresh temp DSH_WEBMCP_TRACE_DIR.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { traceDir, traceEvent, percentile, summarizeEvents, loadRecentEvents, diffManifests } from '../lib/trace.mjs'

function freshDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-webmcp-trace-'))
  process.env.DSH_WEBMCP_TRACE_DIR = dir
  t.after(() => { delete process.env.DSH_WEBMCP_TRACE_DIR })
  return dir
}

test('traceEvent appends one parseable JSONL line with ts + fields', (t) => {
  const dir = freshDir(t)
  traceEvent({ kind: 'discover', url: 'https://x.test/', durationMs: 12, ok: true })
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'))
  assert.equal(files.length, 1)
  const lines = readFileSync(join(dir, files[0]), 'utf8').trim().split('\n')
  assert.equal(lines.length, 1)
  const ev = JSON.parse(lines[0])
  assert.equal(ev.kind, 'discover')
  assert.equal(ev.url, 'https://x.test/')
  assert.equal(ev.durationMs, 12)
  assert.equal(typeof ev.ts, 'number')
})

test('traceEvent twice → two lines; daily file naming', (t) => {
  const dir = freshDir(t)
  traceEvent({ kind: 'invoke', url: 'https://x.test/', tool: 'a', ok: true })
  traceEvent({ kind: 'invoke', url: 'https://x.test/', tool: 'b', ok: false, error: 'tool-threw' })
  const day = new Date().toISOString().slice(0, 10)
  const lines = readFileSync(join(dir, `${day}.jsonl`), 'utf8').trim().split('\n')
  assert.equal(lines.length, 2)
  assert.equal(JSON.parse(lines[1]).error, 'tool-threw')
})

test('traceEvent creates a missing directory and never throws', (t) => {
  const dir = join(mkdtempSync(join(tmpdir(), 'dsh-webmcp-trace-')), 'deep', 'nested')
  process.env.DSH_WEBMCP_TRACE_DIR = dir
  t.after(() => { delete process.env.DSH_WEBMCP_TRACE_DIR })
  assert.doesNotThrow(() => traceEvent({ kind: 'discover', url: 'https://x.test/', ok: true }))
  assert.equal(readdirSync(dir).length, 1)
})

test('traceEvent in a readonly directory stays silent (POSIX)', (t) => {
  if (process.platform === 'win32') return t.skip('chmod semantics differ on Windows')
  const dir = freshDir(t)
  mkdirSync(dir, { recursive: true })
  chmodSync(dir, 0o555)
  t.after(() => { try { chmodSync(dir, 0o755) } catch {} })
  assert.doesNotThrow(() => traceEvent({ kind: 'discover', url: 'https://x.test/', ok: true }))
})

test('traceDir honors the env override and falls back to home', (t) => {
  const dir = freshDir(t)
  assert.equal(traceDir(), dir)
  delete process.env.DSH_WEBMCP_TRACE_DIR
  assert.ok(traceDir().endsWith(join('.dsh-webmcp', 'trace')))
})

test('percentile edge cases', () => {
  assert.equal(percentile([], 50), null)
  assert.equal(percentile([10], 50), 10)
  assert.equal(percentile([1, 2, 3, 4, 5], 50), 3)
  const hundred = Array.from({ length: 100 }, (_, i) => i + 1)
  assert.equal(percentile(hundred, 95), 95)
  assert.ok(percentile(hundred, 95) >= percentile(hundred, 50))
})

test('summarizeEvents aggregates only call kinds, exact percentiles', () => {
  const events = [
    { kind: 'discover', durationMs: 100, ok: true },
    { kind: 'invoke', durationMs: 200, ok: true },
    { kind: 'invoke', durationMs: 300, ok: true },
    { kind: 'invoke', durationMs: 400, ok: false, error: 'timeout' },
    { kind: 'discover', durationMs: 500, ok: true },
    { kind: 'manifest-drift', url: 'https://x.test/', added: ['a'], removed: [] },
  ]
  const s = summarizeEvents(events)
  assert.equal(s.count, 5)
  assert.equal(s.ok, 4)
  assert.equal(s.fail, 1)
  assert.equal(s.successRate, 0.8)
  assert.equal(s.p50, 300)
  assert.equal(s.p95, 500)
  assert.equal(s.avgMs, 300)
})

test('summarizeEvents on empty input', () => {
  const s = summarizeEvents([])
  assert.equal(s.count, 0)
  assert.equal(s.successRate, null)
  assert.equal(s.p50, null)
})

test('loadRecentEvents across daily files, maxLines, corrupt lines', (t) => {
  const dir = freshDir(t)
  writeFileSync(join(dir, '2026-08-27.jsonl'), '{"ts":1,"kind":"discover"}\n{"ts":2,"kind":"invoke"}\n')
  writeFileSync(join(dir, '2026-08-28.jsonl'), '{"ts":3,"kind":"invoke"}\nNOT-JSON\n{"ts":4,"kind":"discover"}\n')
  const all = loadRecentEvents({ dir, maxLines: 200 })
  assert.equal(all.length, 4)
  assert.deepEqual(all.map((e) => e.ts), [1, 2, 3, 4])
  const tail2 = loadRecentEvents({ dir, maxLines: 2 })
  assert.deepEqual(tail2.map((e) => e.ts), [3, 4])
})

test('loadRecentEvents on a missing directory returns []', (t) => {
  const dir = join(mkdtempSync(join(tmpdir(), 'dsh-webmcp-trace-')), 'nope')
  assert.deepEqual(loadRecentEvents({ dir }), [])
})

test('diffManifests detects added/removed, null on no-change or bad input', () => {
  assert.equal(diffManifests(['a', 'b'], ['a', 'b']), null)
  assert.deepEqual(diffManifests(['a'], ['a', 'b']), { added: ['b'], removed: [] })
  assert.deepEqual(diffManifests(['a', 'b'], ['a']), { added: [], removed: ['b'] })
  assert.deepEqual(diffManifests(['a'], ['b']), { added: ['b'], removed: ['a'] })
  assert.equal(diffManifests(null, ['a']), null)
  assert.equal(diffManifests(['a'], undefined), null)
})
