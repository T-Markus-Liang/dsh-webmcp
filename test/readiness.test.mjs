/**
 * Readiness & dashboard tests for dsh-webmcp (v1.2.0 agent-readiness metrics).
 *
 * Pure node:test — zero network, zero browser. Exercises the readiness scoring
 * contract of `computeReadiness`/`aggregateReadiness` and the `renderDashboard`
 * HTML contract, per the frozen API:
 *
 *   import { computeReadiness, aggregateReadiness } from '../lib/readiness.mjs'
 *   import { renderDashboard } from '../lib/dashboard.js'
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { computeReadiness, aggregateReadiness } from '../lib/readiness.mjs'
import { renderDashboard } from '../lib/dashboard.js'

// ---------------------------------------------------------------------------
// computeReadiness
// ---------------------------------------------------------------------------

test('computeReadiness: everything schema + annotated -> score 100', () => {
  const tools = [
    { name: 'search', inputSchema: {}, annotations: {} },
    { name: 'weather', inputSchema: {}, annotations: {} },
  ]
  const r = computeReadiness(tools)
  assert.equal(r.schemaCompleteness, 1)
  assert.equal(r.annotationCoverage, 1)
  assert.equal(r.score, 100)
})

test('computeReadiness: nothing schema, nothing annotated -> score 0', () => {
  const tools = [{ name: 'a' }, { name: 'b' }]
  const r = computeReadiness(tools)
  assert.equal(r.score, 0)
  assert.equal(r.readOnly, 0)
  assert.equal(r.destructive, 0)
})

test('computeReadiness: mixed tool set -> 2/3, 2/3, score 67, destructive 1, readOnly 1', () => {
  const tools = [
    { name: 'a', inputSchema: {} },                         // schema only
    { name: 'b', annotations: { destructiveHint: true } },  // annotations only, destructive
    { name: 'c', inputSchema: {}, annotations: { readOnlyHint: true } }, // both, read-only
  ]
  const r = computeReadiness(tools)
  assert.equal(r.schemaCompleteness, 2 / 3)
  assert.equal(r.annotationCoverage, 2 / 3)
  assert.equal(r.score, 67)
  assert.equal(r.destructive, 1)
  assert.equal(r.readOnly, 1)
})

test('computeReadiness: empty array -> nulls and zero count', () => {
  const r = computeReadiness([])
  assert.equal(r.toolCount, 0)
  assert.equal(r.score, null)
  assert.equal(r.schemaCompleteness, null)
})

// ---------------------------------------------------------------------------
// aggregateReadiness
// ---------------------------------------------------------------------------

test('aggregateReadiness: two origins sorted desc, toolCount 3, mean score 50', () => {
  const agg = aggregateReadiness({
    'https://example-a.com': [
      { name: 'a1', inputSchema: {}, annotations: {} },
      { name: 'a2', inputSchema: {}, annotations: {} },
    ], // -> score 100
    'https://example-b.com': [{ name: 'b1' }], // no schema, no annotations -> score 0
  })
  assert.equal(agg.origins.length, 2)
  assert.equal(agg.origins[0].origin, 'https://example-a.com') // 100 first
  assert.equal(agg.toolCount, 3)
  assert.equal(agg.score, 50)
})

test('aggregateReadiness: empty object -> empty origins, null score', () => {
  const agg = aggregateReadiness({})
  assert.equal(agg.origins.length, 0)
  assert.equal(agg.toolCount, 0)
  assert.equal(agg.score, null)
})

// ---------------------------------------------------------------------------
// renderDashboard
// ---------------------------------------------------------------------------

test('renderDashboard: sections, tester endpoint, and readiness table row', () => {
  const origin = 'https://schema.example.com'
  const html = renderDashboard({
    plugin: 'webmcp',
    version: '1.1.1',
    config: {},
    pool: { hosts: [], size: 0, maxSessions: 0 },
    events: [],
    stats: { count: 0, successRate: 1, fail: 0, p50: 0, p95: 0, avgMs: 0 },
    readiness: {
      origins: [
        { origin, toolCount: 5, schemaCompleteness: 1, annotationCoverage: 1, readOnly: 0, destructive: 0, score: 90 },
      ],
      toolCount: 5,
      score: 90,
    },
  })

  assert.match(html, /Agent readiness/)
  assert.match(html, /Tool tester/)
  assert.match(html, /\/webmcp\/tester/)
  assert.match(html, /runTester\(\)/)
  assert.ok(html.includes(origin))
  assert.ok(html.includes('>90<')) // readiness score cell renders 90
})
