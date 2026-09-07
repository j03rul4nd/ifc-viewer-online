/** Regional appearance only; never used to infer an object's geographic position. */
export function isShanghai(lat: number, lon?: number): boolean {
  return lon !== undefined && lat >= 30.65 && lat <= 31.9 && lon >= 120.85 && lon <= 122.05
}
