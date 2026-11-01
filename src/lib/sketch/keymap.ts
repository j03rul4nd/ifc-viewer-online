// ─── Editable shortcuts ───────────────────────────────────────────────────────
// Defaults a Clip Studio or Photoshop hand already knows. A user's changes are
// stored as differences, so a new action later still gets its default.

export const DEFAULT_KEYS = {
  pen: 'p', pencil: 'b', marker: 'y', line: 'u', eraser: 'e', lasso: 'l', picker: 'i', reshape: 'a', laser: 'k',
  swap: 'x', defaults: 'd', sizeDown: '[', sizeUp: ']', rollLeft: ',', rollRight: '.',
} as const

export type KeyAction = keyof typeof DEFAULT_KEYS
export type KeyOverrides = Partial<Record<KeyAction, string>>

export const KEY_ACTIONS = Object.keys(DEFAULT_KEYS) as KeyAction[]

export const keyFor = (action: KeyAction, overrides: KeyOverrides): string => overrides[action] ?? DEFAULT_KEYS[action]

export function actionForKey(key: string, overrides: KeyOverrides): KeyAction | null {
  const k = key.toLowerCase()
  return KEY_ACTIONS.find((a) => keyFor(a, overrides) === k) ?? null
}

/** Numbers set opacity and these belong to the app or the browser: never bindable. */
export const isBindable = (key: string): boolean => key.length === 1 && !/[0-9 ?]/.test(key)

/** Taking a key from another action gives that action this one's old key: nothing ends up unreachable. */
export function rebind(overrides: KeyOverrides, action: KeyAction, key: string): KeyOverrides {
  const k = key.toLowerCase()
  const other = actionForKey(k, overrides)
  const next = { ...overrides, [action]: k }
  if (other && other !== action) next[other] = keyFor(action, overrides)
  return next
}
