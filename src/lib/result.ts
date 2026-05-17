// ─── Result<T, E> — explicit error handling without throw/catch ───────────────
// Modelled after Rust's Result type.
//
// Usage:
//   const r = await safeAsync(() => exportAsIfc())
//   if (r.ok) downloadBlob(r.value, 'model.ifc')
//   else      toast(r.error.message, 'error')

export type Ok<T>        = { readonly ok: true;  readonly value: T }
export type Err<E = Error> = { readonly ok: false; readonly error: E }
export type Result<T, E = Error> = Ok<T> | Err<E>

// ── Constructors ──────────────────────────────────────────────────────────────

export const ok  = <T>(value: T):  Ok<T>  => ({ ok: true,  value })
export const err = <E>(error: E):  Err<E> => ({ ok: false, error })

// ── Type guards ───────────────────────────────────────────────────────────────

export function isOk<T,  E>(r: Result<T, E>): r is Ok<T>  { return  r.ok }
export function isErr<T, E>(r: Result<T, E>): r is Err<E> { return !r.ok }

// ── Transformers ──────────────────────────────────────────────────────────────

/** Extract value or throw — use only at boundaries where throw is acceptable. */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value
  throw r.error instanceof Error ? r.error : new Error(String(r.error))
}

/** Extract value or return a fallback. */
export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback
}

/** Map the Ok value, leaving Err unchanged. */
export function mapOk<T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r
}

/** Map the Err value, leaving Ok unchanged. */
export function mapErr<T, E, F>(r: Result<T, E>, fn: (e: E) => F): Result<T, F> {
  return r.ok ? r : err(fn(r.error))
}

// ── Async wrappers ────────────────────────────────────────────────────────────

/** Wrap an async function that might throw into a Result. */
export async function safeAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return ok(await fn())
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)))
  }
}

/** Wrap a synchronous function that might throw into a Result. */
export function safe<T>(fn: () => T): Result<T, Error> {
  try {
    return ok(fn())
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)))
  }
}

/** Collapse an array of Results — returns first Err, or Ok with all values. */
export function collectResults<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = []
  for (const r of results) {
    if (!r.ok) return r
    values.push(r.value)
  }
  return ok(values)
}
