// ─── Defensive programming utilities ──────────────────────────────────────────

/**
 * Assert an invariant holds. Throws in all environments.
 * Use for programming bugs that should never occur in correct code.
 *
 * @example
 * invariant(buffer.byteLength > 0, 'IFC buffer must not be empty')
 */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[Invariant] ${message}`)
}

/**
 * Assert a value is non-null / non-undefined. Throws in all environments.
 *
 * @example
 * const el = assertDefined(document.getElementById('root'), '#root not found')
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message: string,
): asserts value is T {
  if (value == null) throw new Error(`[Assert] ${message}`)
}

/**
 * Exhaustiveness check for discriminated unions.
 * Place in the `default` branch of a `switch` to get a compile-time error
 * when a new variant is added to the union but not handled here.
 *
 * @example
 * switch (event.type) {
 *   case 'A': ...; break
 *   case 'B': ...; break
 *   default: assertNever(event.type)
 * }
 */
export function assertNever(x: never, label?: string): never {
  throw new Error(`[AssertNever] Unhandled case: ${String(x)}${label ? ` (${label})` : ''}`)
}

/**
 * Development-only warning. Silently ignored in production builds.
 * Use for non-critical invariants or expensive checks.
 *
 * @example
 * devWarn(ids.length < 10_000, 'Large selection may be slow')
 */
export function devWarn(condition: unknown, message: string): void {
  if (import.meta.env.DEV && !condition) {
    // eslint-disable-next-line no-console
    console.warn(`[DevWarn] ${message}`)
  }
}
