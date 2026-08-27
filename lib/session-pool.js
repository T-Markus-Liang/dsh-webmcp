/**
 * BrowserSessionPool (v0.4.0): one BrowserSession per origin, bounded by
 * capacity, with LRU eviction and idle reclamation.
 *
 * Design choices (deliberate, documented):
 * - Per-session own browser process. A shared browser with per-origin
 *   contexts would be lighter, but per-process isolation gives each site a
 *   fully separate storage state — the safer default for a tool that follows
 *   agent-provided URLs. Capacity (maxSessions) bounds the resource cost.
 * - LRU order rides Map insertion order: acquire() re-inserts on touch.
 * - Idle reclaim uses unref'd timers so the pool never keeps a process alive.
 * - The session factory is injectable so unit tests need no browser.
 */
import { createSession } from './index.js'

async function safeClose(session) {
  try { if (session && typeof session.close === 'function') await session.close() } catch (_) {}
}

export class BrowserSessionPool {
  /**
   * @param {object} cfg          resolved config (maxSessions, idleTtlMs required)
   * @param {(cfg: object) => object} [factory] session factory (tests inject a mock)
   */
  constructor(cfg, factory = null) {
    this.cfg = cfg
    this.maxSessions = cfg.maxSessions
    this.idleTtlMs = cfg.idleTtlMs
    this.factory = factory || ((c) => createSession(c))
    this.sessions = new Map() // originKey → { session, lastUsed, timer }
    this.stats = { acquired: 0, evicted: 0, reclaimed: 0 }
  }

  keyOf(url) {
    try { return new URL(url).origin } catch { return String(url) }
  }

  /** Get (or create) the session bound to this URL's origin. */
  acquire(url) {
    const key = this.keyOf(url)
    let entry = this.sessions.get(key)
    if (entry) {
      if (entry.timer) { clearTimeout(entry.timer); entry.timer = null }
      // LRU touch: re-insert moves to the newest end.
      this.sessions.delete(key)
      this.sessions.set(key, entry)
    } else {
      entry = { session: this.factory(this.cfg), lastUsed: Date.now(), timer: null }
      this.sessions.set(key, entry)
      this.stats.acquired += 1
      this._evictIfNeeded()
    }
    entry.lastUsed = Date.now()
    this._scheduleIdle(key, entry)
    return entry.session
  }

  /** Run fn(session) against the origin-bound session, refreshing LRU/idle. */
  async run(url, fn) {
    const session = this.acquire(url)
    try {
      return await fn(session)
    } finally {
      const key = this.keyOf(url)
      const entry = this.sessions.get(key)
      if (entry && entry.session === session) {
        entry.lastUsed = Date.now()
        if (entry.timer) { clearTimeout(entry.timer); entry.timer = null }
        this._scheduleIdle(key, entry)
      }
    }
  }

  _evictIfNeeded() {
    while (this.sessions.size > this.maxSessions) {
      const oldestKey = this.sessions.keys().next().value
      const oldest = this.sessions.get(oldestKey)
      this.sessions.delete(oldestKey)
      if (oldest.timer) clearTimeout(oldest.timer)
      this.stats.evicted += 1
      void safeClose(oldest.session)
    }
  }

  _scheduleIdle(key, entry) {
    if (this.idleTtlMs <= 0) return
    entry.timer = setTimeout(() => {
      if (this.sessions.get(key) === entry) {
        this.sessions.delete(key)
        this.stats.reclaimed += 1
        void safeClose(entry.session)
      }
    }, this.idleTtlMs)
    if (typeof entry.timer.unref === 'function') entry.timer.unref()
  }

  status() {
    const hosts = []
    for (const [key, e] of this.sessions) {
      hosts.push({ origin: key, lastUsed: e.lastUsed, ...(typeof e.session.status === 'function' ? e.session.status() : {}) })
    }
    return { size: this.sessions.size, maxSessions: this.maxSessions, idleTtlMs: this.idleTtlMs, stats: { ...this.stats }, hosts }
  }

  async close() {
    const entries = Array.from(this.sessions.values())
    this.sessions.clear()
    for (const e of entries) {
      if (e.timer) clearTimeout(e.timer)
      await safeClose(e.session)
    }
  }
}
