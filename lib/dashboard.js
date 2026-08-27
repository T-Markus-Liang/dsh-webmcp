/**
 * /webmcp/dashboard renderer (v0.5.0): framework-free, inline-CSS HTML page
 * with a 5s meta refresh. Pure function — trivially testable, zero deps.
 */

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const ms = (v) => (v == null ? '—' : `${Math.round(v)}ms`)
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)

export function renderDashboard({ plugin, version, config, pool, events, stats }) {
  const recent = [...events].reverse().slice(0, 20)
  const drift = events.filter((e) => e.kind === 'manifest-drift').slice(-5).reverse()

  const rows = recent.map((e) => `
      <tr class="${e.ok === false ? 'fail' : ''}">
        <td>${new Date(e.ts).toLocaleTimeString()}</td>
        <td><span class="kind">${esc(e.kind)}</span></td>
        <td class="url" title="${esc(e.url)}">${esc(e.tool || '')} <span class="dim">${esc((e.url || '').slice(0, 60))}</span></td>
        <td>${ms(e.durationMs)}</td>
        <td>${e.ok === true ? '<span class="ok">ok</span>' : e.ok === false ? `<span class="bad">${esc(e.error || 'fail')}</span>` : '—'}</td>
        <td>${e.reused ? '<span class="dim">reused</span>' : ''}</td>
      </tr>`).join('')

  const driftRows = drift.map((e) => `
      <tr><td>${new Date(e.ts).toLocaleTimeString()}</td><td class="url">${esc((e.url || '').slice(0, 50))}</td>
      <td><span class="ok">+${(e.added || []).length}</span> ${esc((e.added || []).join(', '))}</td>
      <td><span class="bad">-${(e.removed || []).length}</span> ${esc((e.removed || []).join(', '))}</td></tr>`).join('')

  const hostRows = (pool.hosts || []).map((h) => `
      <tr><td class="url">${esc(h.origin)}</td><td>${h.launched ? 'launched' : 'idle'}</td><td>${h.stats ? h.stats.navigations : '—'}</td></tr>`).join('')

  const cfgRows = Object.entries(config || {})
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td><code>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</code></td></tr>`).join('')

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta http-equiv="refresh" content="5">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(plugin)} dashboard</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 28px; font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
         background: #0d1117; color: #c9d1d9; }
  h1 { font-size: 18px; margin: 0 0 4px; color: #f0f6fc; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: #8b949e; margin: 26px 0 8px; }
  .sub { color: #8b949e; margin-bottom: 20px; }
  .cards { display: flex; gap: 12px; flex-wrap: wrap; }
  .card { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 14px 18px; min-width: 110px; }
  .card .n { font-size: 22px; color: #f0f6fc; }
  .card .l { color: #8b949e; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
  table { width: 100%; border-collapse: collapse; background: #161b22; border: 1px solid #21262d; border-radius: 8px; overflow: hidden; }
  th, td { text-align: left; padding: 7px 12px; border-bottom: 1px solid #21262d; }
  th { color: #8b949e; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
  tr.fail td { background: rgba(248, 81, 73, .06); }
  .ok { color: #3fb950; } .bad { color: #f85149; } .dim { color: #6e7681; }
  .kind { background: #21262d; border-radius: 4px; padding: 1px 7px; font-size: 12px; }
  .url { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  code { background: #21262d; border-radius: 4px; padding: 1px 6px; font-size: 12px; }
  .empty { color: #6e7681; padding: 14px; }
</style></head><body>
<h1>${esc(plugin)} <span class="dim">v${esc(version)}</span></h1>
<div class="sub">auto-refresh 5s · trace: ~/.dsh-webmcp/trace/ · <a href="/webmcp/status" style="color:#58a6ff">JSON status</a></div>

<h2>Aggregates (last ${stats.count} calls)</h2>
<div class="cards">
  <div class="card"><div class="n">${stats.count}</div><div class="l">calls</div></div>
  <div class="card"><div class="n ${stats.fail ? 'bad' : 'ok'}">${pct(stats.successRate)}</div><div class="l">success</div></div>
  <div class="card"><div class="n">${ms(stats.p50)}</div><div class="l">p50</div></div>
  <div class="card"><div class="n">${ms(stats.p95)}</div><div class="l">p95</div></div>
  <div class="card"><div class="n">${ms(stats.avgMs)}</div><div class="l">avg</div></div>
  <div class="card"><div class="n">${pool.size}/${pool.maxSessions}</div><div class="l">sessions</div></div>
</div>

<h2>Pool</h2>
${hostRows ? `<table><tr><th>origin</th><th>state</th><th>navigations</th></tr>${hostRows}</table>` : '<div class="empty">no live sessions</div>'}

<h2>Recent calls</h2>
${rows ? `<table><tr><th>time</th><th>kind</th><th>tool / url</th><th>duration</th><th>result</th><th></th></tr>${rows}</table>` : '<div class="empty">no traced calls yet</div>'}

<h2>Manifest drift</h2>
${driftRows ? `<table><tr><th>time</th><th>url</th><th>added</th><th>removed</th></tr>${driftRows}</table>` : '<div class="empty">no drift detected</div>'}

<h2>Config</h2>
<table>${cfgRows}</table>
</body></html>`
}
