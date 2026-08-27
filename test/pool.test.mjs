/**
 * BrowserSessionPool tests (pure node:test + assert, no browser).
 *
 * Injection contract (frozen):
 *   const pool = new BrowserSessionPool(cfg, factory)  // factory: cfg => mockSession
 *   pool.keyOf(url)      // origin string incl. port
 *   pool.acquire(url)    // session; same-origin reuses same session
 *   pool.run(url, fn)    // await fn(session); finally refreshes lastUsed/idle
 *   pool.status()        // { size, maxSessions, idleTtlMs, stats, hosts }
 *   await pool.close()   // close everything
 *
 * cfg needs only { maxSessions, idleTtlMs }.
 * mockSession = { close: async () => { closed++ }, status: () => ({ launched: true }) }
 *
 * Run: node --test test/pool.test.mjs  (no env required)
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { BrowserSessionPool } from '../lib/session-pool.js'

/** Build a pool with a shared-mock factory plus bookkeeping so we can tell
 *  which sessions were created and which were closed. */
function makeHarness(cfg) {
  const state = { closed: 0, created: [], closedSessions: [] }
  const factory = (c) => {
    const s = {
      close: async () => {
        state.closed += 1
        state.closedSessions.push(s)
      },
      status: () => ({ launched: true }),
    }
    state.created.push(s)
    return s
  }
  const pool = new BrowserSessionPool(cfg, factory)
  return { pool, state }
}

/** Yield to the event loop so `void safeClose(...)` microtasks settle. */
const flush = () => new Promise((r) => setImmediate(r))

test('1. 同源 acquire 复用同一会话', async () => {
  const { pool, state } = makeHarness({ maxSessions: 2, idleTtlMs: 0 })
  try {
    const s1 = pool.acquire('http://localhost:3000/pathA')
    const s2 = pool.acquire('http://localhost:3000/pathB')
    assert.strictEqual(s1, s2, 'same origin must yield the same session object')
    assert.strictEqual(pool.status().size, 1, 'one origin => one entry')
    assert.strictEqual(state.created.length, 1, 'factory called exactly once')
    assert.strictEqual(state.closed, 0, 'nothing closed yet')
  } finally {
    await pool.close()
  }
})

test('2. 不同端口 = 不同 origin → 两个不同会话', async () => {
  const { pool, state } = makeHarness({ maxSessions: 5, idleTtlMs: 0 })
  try {
    const s1 = pool.acquire('http://localhost:3000')
    const s2 = pool.acquire('http://localhost:3001')
    assert.notStrictEqual(s1, s2, 'different ports must be different sessions')
    assert.strictEqual(pool.status().size, 2)
    assert.strictEqual(state.created.length, 2)
  } finally {
    await pool.close()
  }
})

test('3. LRU 驱逐：acquire a,b,c → a 被驱逐', async () => {
  const { pool, state } = makeHarness({ maxSessions: 2, idleTtlMs: 0 })
  try {
    const a = pool.acquire('http://localhost:3000')
    const b = pool.acquire('http://localhost:3001')
    const c = pool.acquire('http://localhost:3002')

    const st = pool.status()
    assert.strictEqual(st.size, 2)
    assert.strictEqual(st.stats.evicted, 1, 'exactly one eviction')
    assert.strictEqual(state.created.length, 3, 'factory called 3 times')

    // Factory order: a, b, c — still in pool are b & c.
    assert.notStrictEqual(a, b)
    assert.notStrictEqual(b, c)
    assert.ok(typeof c === 'object')
    assert.strictEqual(st.hosts.length, 2)
    await flush()
    assert.ok(state.closedSessions.includes(a), 'evicted session a was closed')
    assert.strictEqual(state.closed, 1)
  } finally {
    await pool.close()
  }
})

test('4. LRU touch：触摸 a 后，驱逐的是 b 而非 a', async () => {
  const { pool, state } = makeHarness({ maxSessions: 2, idleTtlMs: 0 })
  try {
    const a = pool.acquire('http://localhost:3000')
    const b = pool.acquire('http://localhost:3001') // order: [a, b]
    pool.acquire('http://localhost:3000') // touch a -> order: [b, a]
    const c = pool.acquire('http://localhost:3002') // c -> evict oldest = b

    const st = pool.status()
    assert.strictEqual(st.size, 2)
    assert.strictEqual(st.stats.evicted, 1)
    assert.notStrictEqual(a, b)
    assert.notStrictEqual(b, c)
    await flush()
    assert.ok(state.closedSessions.includes(b), 'LRU evicted b, not a')
    assert.ok(!state.closedSessions.includes(a), 'a was NOT evicted')
    // a and c remain in the pool.
    assert.ok(st.hosts.some((h) => h.origin === 'http://localhost:3000'))
    assert.ok(st.hosts.some((h) => h.origin === 'http://localhost:3002'))
    assert.ok(!st.hosts.some((h) => h.origin === 'http://localhost:3001'))
  } finally {
    await pool.close()
  }
})

test('5. idle 回收：idleTtlMs=50，等 120ms → size 0', async () => {
  const { pool, state } = makeHarness({ maxSessions: 3, idleTtlMs: 50 })
  try {
    pool.acquire('http://localhost:3000')
    assert.strictEqual(pool.status().size, 1)
    await new Promise((r) => setTimeout(r, 120))
    await flush()
    const st = pool.status()
    assert.strictEqual(st.size, 0, 'idle session reclaimed')
    assert.strictEqual(st.stats.reclaimed, 1)
    assert.strictEqual(state.closed, 1, 'reclaimed session was closed')
  } finally {
    await pool.close()
  }
})

test('6. idleTtlMs=0 → 不回收', async () => {
  const { pool, state } = makeHarness({ maxSessions: 3, idleTtlMs: 0 })
  try {
    pool.acquire('http://localhost:3000')
    await new Promise((r) => setTimeout(r, 120))
    const st = pool.status()
    assert.strictEqual(st.size, 1, 'idleTtlMs=0 disables reclamation')
    assert.strictEqual(st.stats.reclaimed, 0)
    assert.strictEqual(state.closed, 0)
  } finally {
    await pool.close()
  }
})

test('7. run() 透传返回值；fn 抛错时错误上抛且会话保留', async () => {
  const { pool, state } = makeHarness({ maxSessions: 3, idleTtlMs: 0 })
  try {
    const got = await pool.run('http://localhost:3000', (s) => {
      assert.ok(s, 'fn receives the session')
      return 42
    })
    assert.strictEqual(got, 42, 'run returns the fn value')

    const boom = new Error('boom')
    await assert.rejects(
      pool.run('http://localhost:3000', () => {
        throw boom
      }),
      (e) => e === boom,
      'fn error propagates through run'
    )

    // Session must remain in the pool after a thrown fn.
    assert.strictEqual(pool.status().size, 1, 'session retained after error')
    assert.strictEqual(state.closed, 0)
  } finally {
    await pool.close()
  }
})

test('8. status() 形状', async () => {
  const { pool } = makeHarness({ maxSessions: 2, idleTtlMs: 0 })
  try {
    pool.acquire('http://localhost:3000')
    const st = pool.status()
    assert.ok('size' in st, 'size present')
    assert.ok('maxSessions' in st, 'maxSessions present')
    assert.ok('idleTtlMs' in st, 'idleTtlMs present')
    assert.ok(Array.isArray(st.hosts), 'hosts is an array')
    assert.ok('stats' in st, 'stats present')
    assert.ok('acquired' in st.stats, 'stats.acquired present')
    assert.ok('evicted' in st.stats, 'stats.evicted present')
    assert.ok('reclaimed' in st.stats, 'stats.reclaimed present')
    assert.strictEqual(st.maxSessions, 2)
    assert.strictEqual(st.idleTtlMs, 0)
  } finally {
    await pool.close()
  }
})

test('9. close() 后 size===0 且所有 mock close 被调用', async () => {
  const { pool, state } = makeHarness({ maxSessions: 3, idleTtlMs: 0 })
  try {
    pool.acquire('http://localhost:3000')
    pool.acquire('http://localhost:3001')
    pool.acquire('http://localhost:3002')
    assert.strictEqual(pool.status().size, 3, 'three sessions acquired')

    await pool.close()

    assert.strictEqual(pool.status().size, 0, 'pool emptied after close')
    assert.strictEqual(state.closed, 3, 'every mock session close called')
    assert.strictEqual(state.created.length, state.closed)
  } finally {
    await pool.close()
  }
})
