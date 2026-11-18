// Scene-setup failure tagging (viewer.ts setupLoadedModel → analytics).

/** Steps of the post-load scene setup, in order (see setupLoadedModel). */
export type SetupStep = 'categories' | 'items' | 'types' | 'paint' | 'frame'

const SETUP_STEPS: ReadonlySet<string> = new Set<SetupStep>(['categories', 'items', 'types', 'paint', 'frame'])

/**
 * Append `[setup:<step>]` to a setup failure's message, keeping its `code`
 * (a typed error stays typed) and its name. Cancellations pass through untouched.
 */
export function tagSetupError(err: unknown, step: SetupStep): unknown {
  if (typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError') return err
  if (err instanceof Error) {
    if (/\[setup:/.test(err.message)) return err
    try { err.message = `${err.message} [setup:${step}]`; return err } catch { /* frozen */ }
    const wrapped = new Error(`${err.message} [setup:${step}]`)
    wrapped.name = err.name
    return Object.assign(wrapped, { code: (err as { code?: unknown }).code })
  }
  return new Error(`${String(err)} [setup:${step}]`)
}

/** The `[setup:<step>]` tag viewer.ts adds to scene-setup failures, allowlisted. */
export function setupStepOf(message: string): string | undefined {
  const step = /\[setup:([a-z]+)\]/.exec(message)?.[1]
  return step && SETUP_STEPS.has(step) ? step : undefined
}
