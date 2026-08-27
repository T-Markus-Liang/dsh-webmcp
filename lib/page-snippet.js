/**
 * Thin loader: the in-page code lives in page-agent.js as REAL JavaScript
 * (node --check-able) since v0.2.2. This module reads it once and exports the
 * two injection strings consumed by index.js via page.evaluate().
 *
 * The trailing invocation is what makes evaluate() return a value: evaluate()
 * awaits the last expression, so `dshDiscoverRun()` resolves the tools list
 * and `dshInvokeInstall()` resolves `true` once installed.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'page-agent.js'), 'utf8')

export const DISCOVER_SNIPPET = source + '\n;dshDiscoverRun();'
export const INVOKE_INSTALL_SNIPPET = source + '\n;dshInvokeInstall();'
