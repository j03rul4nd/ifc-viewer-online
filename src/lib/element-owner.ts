// ─── element-owner ────────────────────────────────────────────────────────────
// WHICH LOADED MODEL AN ELEMENT ID MEANS.
//
// An expressID is only unique inside its own file: every IFC numbers from #1,
// so in a federated set #1234 is a wall in the architecture model AND a duct in
// the MEP one. Anything that acts on "element N" has to be told the model, and
// the callers that know it must pass it.
//
// When none is given — an SDK `select` without a modelId, the `?select=` deep
// link — the answer must match what selection does in the same situation, or
// the camera flies to one element while another one turns blue. Selection
// falls back to the ACTIVE model, so this does too, and only goes looking in
// the other models when the active one has no such id.
//
// PURE: ids and type maps in, a model id out. No THREE, no store.

/**
 * The model `expressId` refers to.
 * - an explicit `modelId` always wins;
 * - otherwise the active model, if it has that id;
 * - otherwise the first loaded model that has it;
 * - otherwise the active model (null when nothing is active).
 */
export function ownerModelId(
  expressId: number,
  modelId: string | undefined,
  activeModelId: string | null,
  typeMaps: ReadonlyMap<string, ReadonlyMap<number, unknown>>,
): string | null {
  if (modelId) return modelId
  if (activeModelId && typeMaps.get(activeModelId)?.has(expressId)) return activeModelId
  for (const [id, types] of typeMaps) if (types.has(expressId)) return id
  return activeModelId
}
