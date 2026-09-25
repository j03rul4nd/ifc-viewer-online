// ─── steps ────────────────────────────────────────────────────────────────────
// A long, pure computation written as a generator that `yield`s wherever it is
// safe to pause.
//
// WHY A GENERATOR AND NOT A SECOND IMPLEMENTATION. The road layer was one
// synchronous 1.3–1.4 s task on a real district (Poblenou, 2 895 ways, 1.17 M
// vertices), and no single stage of it dominated: the time is spread over every
// vertex. The only way to hand the main thread back is to stop in the middle of
// the work — and a builder that can stop is a builder whose loops can be
// suspended with their state intact, which is exactly what a generator is.
//
// The same generator backs both entry points. `runToEnd` drives it without ever
// pausing, which is the synchronous builder every test and caller already
// uses; `runSliced` (render-scheduler) drives it a slice at a time. Because
// there is ONE body, the sliced build cannot drift from the synchronous one:
// a `yield` carries no value and changes no state, so where the pauses fall has
// no effect on what is built.
//
// PURE: no DOM, no clock. Pacing belongs to whoever drives the steps.

/** A computation that returns `T`, pausable at each `yield`. */
export type Steps<T> = Generator<void, T, void>

/** Drive a step generator to completion without pausing. */
export function runToEnd<T>(steps: Steps<T>): T {
  for (;;) {
    const r = steps.next()
    if (r.done) return r.value
  }
}
