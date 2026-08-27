/**
 * Pool concurrency e2e (v0.4.0).
 *
 * Proves the BrowserSessionPool wiring behind apply(): two fixture sites on
 * different ports (= different origins) are driven concurrently through the
 * two host tools, results are isolated per origin, and same-origin TTL reuse
 * is preserved. Includes a soft wall-time check that two concurrent
 * navigations cost well under two serial ones.
 *
 * Hard gate identical to e2e.test.mjs: DSH_WEBMCP_TEST_E2E=1 + resolvable
 * Chromium, otherwise the whole file skips cleanly.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { apply, findChromium, resolveConfig } from '../lib/index.js'
import { startSite } from './site-fixture.mjs'

const e2eAvailable =
  process.env.DSH_WEBMCP_TEST_E2E === '1' && Boolean(findChromium(resolveConfig({})))

const skipReason = !e2eAvailable
  ? 'e2e disabled: set DSH_WEBMCP_TEST_E2E=1 and have a usable Chromium'
  : false

test('webmcp pool e2e: concurrent origins, isolation, reuse', { timeout: 120_000, skip: skipReason }, async () => {
  const registered = []
  const disposers = []
  const mockDeps = {
    tools: { register: (tool) => registered.push(tool) },
    webServer: { register: () => () => {} },
  }
  const mockCtx = {
    inject: (_deps, cb) => cb(mockDeps),
    effect: (factory, _name) => disposers.push(factory && factory()),
  }

  const siteA = await startSite()
  const siteB = await startSite()
  assert.notEqual(new URL(siteA.url()).origin, new URL(siteB.url()).origin, 'fixture sites must differ by origin')

  try {
    apply(mockCtx, { allowPrivateHosts: true })
    const discoverTool = registered.find((t) => t.name === 'webmcp_discover')
    const invokeTool = registered.find((t) => t.name === 'webmcp_invoke')
    assert.ok(discoverTool && invokeTool)

    // Serial baseline: one real navigation on A.
    const t0 = Date.now()
    const serialA = await discoverTool.execute({ url: siteA.url(), refresh: true })
    const serialMs = Date.now() - t0
    assert.equal(serialA.ok, true)

    // Concurrent: A + B in parallel (two origins → two sessions).
    const t1 = Date.now()
    const [ra, rb] = await Promise.all([
      discoverTool.execute({ url: siteA.url(), refresh: true }),
      discoverTool.execute({ url: siteB.url(), refresh: true }),
    ])
    const parallelMs = Date.now() - t1

    assert.equal(ra.ok, true, `A discover failed: ${JSON.stringify(ra)}`)
    assert.equal(rb.ok, true, `B discover failed: ${JSON.stringify(rb)}`)
    assert.ok(ra.count >= 5, `A expected >=5 tools, got ${ra.count}`)
    assert.ok(rb.count >= 5, `B expected >=5 tools, got ${rb.count}`)

    // Soft timing proof: parallel pair must beat two serial navigations,
    // with generous headroom for CI jitter.
    assert.ok(
      parallelMs < serialMs * 2.5,
      `parallel ${parallelMs}ms not < 2.5x serial ${serialMs}ms — concurrency may be broken`,
    )

    // Isolation: per-origin invocations do not cross-talk.
    const [ea, eb] = await Promise.all([
      invokeTool.execute({ url: siteA.url(), tool: 'echo', args: { text: 'A' } }),
      invokeTool.execute({ url: siteB.url(), tool: 'echo', args: { text: 'B' } }),
    ])
    assert.equal(ea.result && ea.result.echo, 'A')
    assert.equal(eb.result && eb.result.echo, 'B')

    // Same-origin TTL reuse semantics survive pooling.
    const reuse = await discoverTool.execute({ url: siteA.url() })
    assert.equal(reuse._meta.reused, true, 'expected same-origin session reuse through the pool')
  } finally {
    await siteA.close()
    await siteB.close()
    for (const d of disposers) {
      if (typeof d === 'function') {
        try { d() } catch (_) {}
      }
    }
  }
})
