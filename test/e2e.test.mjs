/**
 * End-to-end test for dsh-webmcp.
 *
 * Hard gate: only runs when `DSH_WEBMCP_TEST_E2E === '1'` AND a usable
 * Chromium/Chrome is resolvable via `findChromium(resolveConfig({}))`.
 * Otherwise the whole test is skipped.
 *
 * When it does run it uses the real `apply` with a mock host context, starts
 * the in-process over-HTTP fixture, discovers the three site tools and invokes
 * `echo`, then asserts the unknown-tool path — all against a real headless
 * browser over real HTTP.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { apply, findChromium, resolveConfig } from '../lib/index.js'
import { startSite, stopSite } from './site-fixture.mjs'

const e2eAvailable =
  process.env.DSH_WEBMCP_TEST_E2E === '1' && Boolean(findChromium(resolveConfig({})))

const skipReason = !e2eAvailable
  ? 'e2e disabled: set DSH_WEBMCP_TEST_E2E=1 and have a usable Chromium (DSH_WEBMCP_CHROMIUM / ms-playwright cache)'
  : false

test('webmcp e2e: discover + invoke on the fixture site', { timeout: 60_000, skip: skipReason }, async () => {
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

  const site = await startSite()
  try {
    apply(mockCtx, {})

    // The two host tool descriptors were registered.
    const regNames = registered.map((t) => t.name).sort()
    assert.deepEqual(regNames, ['webmcp_discover', 'webmcp_invoke'])
    const discoverTool = registered.find((t) => t.name === 'webmcp_discover')
    const invokeTool = registered.find((t) => t.name === 'webmcp_invoke')
    assert.ok(discoverTool && typeof discoverTool.execute === 'function')
    assert.ok(invokeTool && typeof invokeTool.execute === 'function')

    // discover()
    const disc = await discoverTool.execute({ url: site.url() })
    assert.equal(disc.ok, true, `discover not ok: ${JSON.stringify(disc)}`)
    assert.ok(disc.count >= 4, `expected count>=4 (both modelContext mounts), got ${disc.count}`)
    const foundNames = (disc.tools || []).map((t) => t.name)
    for (const name of ['echo', 'add', 'pageTitle', 'docTitle']) {
      assert.ok(foundNames.includes(name), `missing discovered tool "${name}"`)
    }
    // The dual-mount guarantee (v0.1.1): docTitle must arrive specifically via
    // the document.modelContext surface, proving both mounts are probed.
    const docTitleRow = (disc.tools || []).find((t) => t.name === 'docTitle')
    assert.equal(docTitleRow && docTitleRow.surface, 'document.modelContext')

    // invoke('echo', {text:'ping'}) -> {echo:'ping'}
    const echo = await invokeTool.execute({ url: site.url(), tool: 'echo', args: { text: 'ping' } })
    assert.equal(echo.ok, true, `echo not ok: ${JSON.stringify(echo)}`)
    assert.equal(echo.result.echo, 'ping')

    // invoke('nope') -> unknown-tool
    const nope = await invokeTool.execute({ url: site.url(), tool: 'nope' })
    assert.equal(nope.error, 'unknown-tool')
    assert.equal(nope.ok, false)
  } finally {
    await stopSite()
    for (const d of disposers) {
      if (typeof d === 'function') {
        try {
          d()
        } catch (_) {}
      }
    }
  }
})
