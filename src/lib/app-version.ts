// ─── app-version.ts ───────────────────────────────────────────────────────────
// Single source of truth for the validator's base version. It feeds both the
// signed certificate (`CERTIFY_VALIDATOR_VERSION` in certify/build-payload.ts,
// where it becomes part of the signed payload) and the local certificate shown
// by ValidationExportModal — the two must never diverge for the same run.
// Bumping the version is a one-line edit here.

export const APP_VERSION = '2.0.0'
