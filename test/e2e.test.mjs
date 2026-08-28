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
    // The fixture serves loopback (127.0.0.1), so the v0.2 intranet shield
    // MUST be explicitly relaxed for this harness.
    apply(mockCtx, { allowPrivateHosts: true })

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
    assert.ok(disc.count >= 7, `expected count>=7 (dual mounts + greet + destructive + well-known), got ${disc.count}`)
    const foundNames = (disc.tools || []).map((t) => t.name)
    for (const name of ['echo', 'add', 'greet', 'pageTitle', 'docTitle', 'delete_account', 'wellKnownEcho']) {
      assert.ok(foundNames.includes(name), `missing discovered tool "${name}"`)
    }
    // The dual-mount guarantee (v0.1.1): docTitle must arrive specifically via
    // the document.modelContext surface, proving both mounts are probed.
    const docTitleRow = (disc.tools || []).find((t) => t.name === 'docTitle')
    assert.equal(docTitleRow && docTitleRow.surface, 'document.modelContext')

    // v1.1.0: annotations passthrough + well-known surface + destructive guard
    const delRow = (disc.tools || []).find((t) => t.name === 'delete_account')
    assert.equal(delRow && delRow.annotations && delRow.annotations.destructiveHint, true, 'delete_account must carry destructiveHint')
    const wkRow = (disc.tools || []).find((t) => t.name === 'wellKnownEcho')
    assert.equal(wkRow && wkRow.surface, 'well-known', 'well-known endpoint must be probed as fifth surface')
    assert.equal(wkRow && wkRow.annotations && wkRow.annotations.readOnlyHint, true)

    const delNoConfirm = await invokeTool.execute({ url: site.url(), tool: 'delete_account' })
    assert.equal(delNoConfirm.ok, false)
    assert.equal(delNoConfirm.error, 'confirm-required', `expected confirm-required, got ${JSON.stringify(delNoConfirm)}`)
    assert.equal(delNoConfirm.annotations && delNoConfirm.annotations.destructiveHint, true)
    const delConfirmed = await invokeTool.execute({ url: site.url(), tool: 'delete_account', confirm: true })
    assert.equal(delConfirmed.ok, true, `confirmed destructive call failed: ${JSON.stringify(delConfirmed)}`)
    assert.equal(delConfirmed.result && delConfirmed.result.deleted, true)
    // read-only tool needs no confirm even without annotations knowledge
    const echoNoConfirm = await invokeTool.execute({ url: site.url(), tool: 'echo', args: { text: 'safe' } })
    assert.equal(echoNoConfirm.ok, true)

    // v0.2.1: executeToolByName dispatch channel (docTitle has no inline execute)
    const docInv = await invokeTool.execute({ url: site.url(), tool: 'docTitle' })
    assert.equal(docInv.ok, true, `docTitle dispatch failed: ${JSON.stringify(docInv)}`)
    assert.equal(docInv.result && docInv.result.title, 'WebMCP Fixture')

    // v0.2.1: argsWarning on missing required args (greet requires name)
    const greetMissing = await invokeTool.execute({ url: site.url(), tool: 'greet' })
    assert.equal(greetMissing.ok, true)
    assert.match(greetMissing.argsWarning, /missing required args: name/)
    const greetOk = await invokeTool.execute({ url: site.url(), tool: 'greet', args: { name: 'neo' } })
    assert.equal(greetOk.argsWarning, undefined)
    assert.equal(greetOk.result.greeting, 'hi neo')

    // invoke('echo', {text:'ping'}) -> {echo:'ping'}
    const echo = await invokeTool.execute({ url: site.url(), tool: 'echo', args: { text: 'ping' } })
    assert.equal(echo.ok, true, `echo not ok: ${JSON.stringify(echo)}`)
    assert.equal(echo.result.echo, 'ping')

    // invoke('nope') -> unknown-tool
    const nope = await invokeTool.execute({ url: site.url(), tool: 'nope' })
    assert.equal(nope.error, 'unknown-tool')
    assert.equal(nope.ok, false)

    // --- v0.2: same-URL session reuse ---------------------------------------
    // The navigation above left lastHref === site.url() within the default
    // 30s TTL, so an identical-URL discover must reuse the live page.
    const reused = await discoverTool.execute({ url: site.url() })
    assert.equal(reused.ok, true)
    assert.equal(reused._meta.reused, true, 'expected same-URL session reuse')
    const forced = await discoverTool.execute({ url: site.url(), refresh: true })
    assert.equal(forced._meta.reused, false, 'refresh:true must force a real navigation')
    assert.equal(typeof forced._meta.navigations, 'number')

    // --- v0.2.2: HTML-form surface — first invoke-path assertions ----------
    // discover on /form-only must expose the declarative form as a tool.
    const formDisc = await discoverTool.execute({ url: site.formUrl() })
    assert.equal(formDisc.ok, true)
    const lookupRow = (formDisc.tools || []).find((t) => t.name === 'lookup')
    assert.ok(lookupRow, 'form-only page must expose tool "lookup"')
    assert.equal(lookupRow.surface, 'html-form')
    assert.ok(lookupRow.inputSchema && lookupRow.inputSchema.properties && lookupRow.inputSchema.properties.q,
      'form tool must surface an inputSchema with field q')

    // invoke fills field q, submits, and reads back [data-webmcp-result].
    const formInv = await invokeTool.execute({ url: site.formUrl(), tool: 'lookup', args: { q: 'Acme' } })
    assert.equal(formInv.ok, true, `form invoke failed: ${JSON.stringify(formInv)}`)
    assert.equal(formInv.surface, 'html-form')
    assert.equal(formInv.result, 'lookup:Acme', `unexpected form result: ${JSON.stringify(formInv.result)}`)

    // v1.0.0: maxResultChars truncation envelope (closes the security-review
    // Threat-3 evidence gap — oversized results must not reach the agent raw).
    const big = await invokeTool.execute({ url: site.url(), tool: 'echo', args: { text: 'x'.repeat(20_000) } })
    assert.equal(big.ok, true, `big echo failed: ${JSON.stringify(big).slice(0, 200)}`)
    assert.equal(big.result.truncated, true, 'oversized result must be truncated')
    assert.ok(big.result.totalBytes > 12_000, `totalBytes ${big.result.totalBytes} should exceed budget`)
    assert.equal(big.result.preview.length, 12_000)
    assert.ok(typeof big.result.hint === 'string' && big.result.hint.length > 0)
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
