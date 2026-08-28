/**
 * Agent-readiness metrics (v1.2.0).
 *
 * Pure functions over a site's discovered tool list — the free/open answer
 * to the readiness-scoring niche that commercial products monetize. Used by
 * the dashboard readiness view; unit-testable without a browser.
 */

/** Agent-facing structure of a discovered tool. */
function isAnnotated(t) {
  return Boolean(t && t.annotations && typeof t.annotations === 'object')
}

/**
 * 0-100 readiness score for a tool set.
 * Weighting: 60% schema completeness, 40% annotation coverage.
 * Tools never lower the score below their contribution — an unannotated site
 * just scores lower, exactly the signal an agent wants.
 */
export function computeReadiness(tools) {
  const list = Array.isArray(tools) ? tools : []
  const schemaComplete = list.filter((t) => t && t.inputSchema && typeof t.inputSchema === 'object')
  const annotated = list.filter(isAnnotated)
  const destructive = list.filter((t) => t && t.annotations && t.annotations.destructiveHint === true)
  const readOnly = list.filter((t) => t && t.annotations && t.annotations.readOnlyHint === true)
  const schemaCompleteness = list.length ? schemaComplete.length / list.length : null
  const annotationCoverage = list.length ? annotated.length / list.length : null
  const score = list.length
    ? Math.round(100 * (0.6 * (schemaCompleteness || 0) + 0.4 * (annotationCoverage || 0)))
    : null
  return {
    toolCount: list.length,
    schemaComplete: schemaComplete.length,
    schemaCompleteness,
    annotated: annotated.length,
    annotationCoverage,
    readOnly: readOnly.length,
    destructive: destructive.length,
    score,
  }
}

/** Aggregate readiness for several sources (e.g. the live session origins). */
export function aggregateReadiness(perOrigin) {
  const origins = []
  let toolCount = 0
  for (const [origin, tools] of Object.entries(perOrigin || {})) {
    const r = computeReadiness(tools)
    origins.push({ origin, ...r })
    toolCount += r.toolCount
  }
  origins.sort((a, b) => (b.score || 0) - (a.score || 0))
  const score = origins.length ? Math.round(origins.reduce((a, o) => a + (o.score || 0), 0) / origins.length) : null
  return { origins, toolCount, score }
}
