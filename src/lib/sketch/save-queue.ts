// ─── Writes that cannot pile up ───────────────────────────────────────────────
// At most one save runs. While it runs, only the newest request waits: an old
// document overtaking a new one, or a queue growing behind a slow disk, is how a
// sketch gets lost on a busy phone.

export class SaveQueue<T> {
  private running = false
  private pending: { value: T } | null = null
  private idle: (() => void)[] = []

  constructor(private readonly write: (value: T) => Promise<boolean>, private readonly report: (ok: boolean) => void) {}

  push(value: T): void {
    this.pending = { value }
    if (!this.running) void this.drain()
  }

  private async drain(): Promise<void> {
    this.running = true
    while (this.pending) {
      const { value } = this.pending
      this.pending = null
      let ok = false
      try { ok = await this.write(value) } catch { ok = false }
      this.report(ok)
    }
    this.running = false
    this.idle.splice(0).forEach((resolve) => resolve())
  }

  /** Resolves when everything asked for so far is written or has failed. */
  flushed(): Promise<void> {
    if (!this.running && !this.pending) return Promise.resolve()
    return new Promise((resolve) => this.idle.push(resolve))
  }
}
