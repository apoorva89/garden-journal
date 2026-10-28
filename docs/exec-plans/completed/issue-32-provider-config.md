# Exec Plan: Issue #32 — Provider Config Module

**Phase:** issue-32  
**Status:** complete

## Scope
Create `lib/ai/providerConfig.ts` as the single source for provider IDs, labels, and model lists. Update the Settings page to derive provider buttons (and model suggestions) from config. Add tests for all four ACs. Add D-102 to DECISIONS.md.

## Files to touch
- `lib/ai/providerConfig.ts` (new)
- `app/(tabs)/settings/page.tsx` (import config; derive provider pills; add model suggestion pills)
- `lib/ai/__tests__/providerConfig.test.ts` (new — AC1, AC3, AC4)
- `e2e/settings-provider-config.spec.ts` (new — AC2)
- `docs/DECISIONS.md` (new D-102 entry)

## Out of scope
- `lib/db.ts` — `Settings.apiKeys` widened to `Record<string, string | undefined>` to remove the cast in the Settings page (review comment 1). No IDB version bump required; change is backwards-compatible.
- Changing which providers or models are supported.
- Sync pipeline, service worker, AI extraction logic.

## Acceptance criteria as test cases

### AC1 — Structural literal scan (Vitest: `lib/ai/__tests__/providerConfig.test.ts`)
Reads all `.ts`/`.tsx` source files, excluding test files and the config module itself.
Builds the forbidden set from `PROVIDERS` (provider IDs + all model names).
Scans for quoted string literals containing any entry. Fails on any hit.

### AC2 — Settings page renders from config (Playwright: `e2e/settings-provider-config.spec.ts`)
Navigate to /settings. Assert each provider button's accessible text equals the config `label`.
Assert no button exists whose text matches a provider ID not in the config.

### AC3 — Single-edit model addition (covered by AC1)
Adding a model to config is sufficient; the literal scan confirms no other file needs changing.

### AC4 — Graceful degradation (Vitest: `lib/ai/__tests__/providerConfig.test.ts`)
`getProviderById('unknown-provider')` returns `undefined`.
`getModelsForProvider('unknown-provider')` returns `[]`.

## Decisions
- `lib/db.ts:143` `Settings.apiKeys` widened to `Record<string, string | undefined>` (review comment 1). Cast removed from Settings page.
- Model UI: suggestion pills above the existing free-text input (approved). User can tap a known model or type anything.

## Progress log
- [x] Approved
- [x] Tests written and confirmed failing
- [x] `lib/ai/providerConfig.ts` created
- [x] Settings page updated
- [x] All tests passing
- [x] DECISIONS.md updated (D-102)
- [x] Commit, PR
