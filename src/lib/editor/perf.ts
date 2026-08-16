'use client';

/**
 * Dev-only interaction performance probe.
 *
 * Enabled by setting `localStorage.snapty-perf = "1"` before opening the
 * editor (or just `localStorage.setItem('snapty-perf', '1')` in the console,
 * then reload). Logs pointermove→draw handler cost every 120 samples so the
 * drawing hot path can be watched without noisy per-event logging.
 *
 * Compiled to no-ops (enabled = false) in production — there is no runtime
 * cost and nothing is logged unless the flag is set.
 */
export class PerfProbe {
  private readonly enabled: boolean;
  private count = 0;
  private acc = 0;
  private worst = 0;

  constructor() {
    let on = false;
    if (typeof window !== 'undefined') {
      try {
        on = window.localStorage.getItem('snapty-perf') === '1';
      } catch {
        on = false;
      }
    }
    this.enabled = on;
  }

  /** Feed the duration of one interaction tick (e.g. one pointermove). */
  tick(durationMs: number, label = 'pointermove') {
    if (!this.enabled) return;
    this.count++;
    this.acc += durationMs;
    if (durationMs > this.worst) this.worst = durationMs;
    if (this.count % 120 === 0) {
      console.debug(
        `[snapty-perf] ${label}: ${this.count} events | avg ${(this.acc / this.count).toFixed(2)}ms | worst ${this.worst.toFixed(2)}ms`,
      );
      this.acc = 0;
      this.worst = 0;
    }
  }
}
