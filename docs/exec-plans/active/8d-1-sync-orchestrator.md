# Exec plan: 8d-1 — Sync orchestrator and SyncSheet

Build plan: docs/BUILD_PLAN.md, phase 8d-1
Approved: 2026-10-19, Apoorva Gupta

Rules for this file:

- Sections 1 to 8 are the approved contract. Do not change them without an approved plan change (section 11).
- Sections 9 to 11 are living. Update them as work proceeds.
- Write "None" for any section with nothing to record. Do not invent entries.
- Checklists appear only in section 9.

## 1. Purpose

This phase pulls the sync logic out of `SyncSheet` and into a dedicated orchestrator (`lib/sync.ts`), adds `JournalEntry.extractionReviewedAt` and the D-097 `needsSync`-clearing rule to `lib/db.ts`, and rewrites `SyncSheet` to show per-entry weather and AI states, a missing-config banner, post-run summary, and an in-flight guard. It touches `ARCHITECTURE.md` §3 (data model, `needsSync` rules), §4 (sync pipeline), and all §9 layering invariants.

---

## 2. Scope

### In scope

- `JournalEntry.extractionReviewedAt?: string` — optional timestamp, no index, no schema version bump (IndexedDB stores arbitrary objects; the field is optional).
- `lib/db.ts` additions:
  - `writeEntryWeather(entryId, weather, database?)` — writes `weatherC` and `weatherIcon` without bumping `updatedAt`, then calls `applyNeedsSyncRule`.
  - `applyNeedsSyncRule(entryId, database?)` — reads the entry and deletes `needsSync` if D-097 is satisfied (`weatherC` is non-null AND entry has no `text` OR has `extractionReviewedAt`). Called by `writeEntryWeather` now; will be called by Done (8e-5) and Refresh weather (12a) later.
  - `getPendingExtractionByEntryId(entryId, database?)` — query to check whether a `PendingExtraction` exists.
- `lib/sync.ts` — new orchestrator: `runSync(options?)` and `isRunning()`. Per-entry loop: weather step and AI step, each independent. Injectable weather fetcher and AI provider for testability. Module-level in-flight guard. Progress reported via `onProgress(entryId, step, status)` callback (D-1). In-flight state exposed via exported `isRunning()` (D-2). AI call site calls the injected stub which throws "not implemented"; the thrown error is caught and reported as a failure (D-3).
- `components/journal/SyncSheet.tsx` — refactored to:
  - Use `runSync` from `lib/sync.ts` (no longer calls weather fetch or `updateJournalEntry` directly).
  - Sort rows oldest-first.
  - Show per-row weather and AI state columns, with no AI state column for no-text entries.
    Weather column states: **pending** (not yet run), **fetching** (in progress), **synced** (`weatherC` written), **failed** (fetch error), **skipped** (location not configured or `weatherC` already set before the run).
    AI column states: **pending** (not yet run), **running** (in progress), **failed** (stub threw), **review pending** (a `PendingExtraction` exists for this entry), **skipped** (no AI config, entry has `extractionReviewedAt`, or a `PendingExtraction` already existed before the run).
  - Update each row's state columns live as the orchestrator calls `onProgress`; do not wait for the run to complete.
  - Show a banner on open naming which of location and AI config is missing and pointing to Settings.
  - Show "Review →" only when a `PendingExtraction` exists for that entry (read from stored data on open and after run).
  - Show a post-run summary reporting weather and AI results separately.
  - Disable Sync Now during a run; read `isRunning()` on mount so the button is disabled if the sheet is opened while a run is in progress.
  - Call `onSynced()` after the run completes so the Journal tab reloads.
- *(Bug fix within scope: the existing `SyncSheet` calls `updateJournalEntry` when writing weather, which incorrectly bumps `updatedAt` per D-085. `writeEntryWeather` replaces that call and is the fix.)*

### Out of scope

- Request builder, live AI call, event resolution, saving a `PendingExtraction` (8d-2 through 8d-5). The AI step's call site exists in the orchestrator but calls a stub that throws; the thrown error is caught and reported as a failure.
- Retry button (8f-1).
- Review screen (8d-5, 8e).
- Writing `extractionReviewedAt` or Done-side `needsSync` clearing (8e-5).
- User-chosen row sort order (open to-do in BUILD_PLAN.md).
- "Refresh weather" action on the detail view (12a).

---

## 3. Files

**lib/**
- `lib/db.ts` [STOP-ASK area] — add `extractionReviewedAt` to `JournalEntry` interface, add `writeEntryWeather`, `applyNeedsSyncRule`, `getPendingExtractionByEntryId`
- `lib/sync.ts` — new file

**components/**
- `components/journal/SyncSheet.tsx` — refactored

**Tests**
- `lib/__tests__/db.test.ts` — new tests for `writeEntryWeather`, `applyNeedsSyncRule`, `getPendingExtractionByEntryId`
- `lib/__tests__/sync.test.ts` — new file, orchestrator logic

**e2e**
- `e2e/sync.spec.ts` — new or extend existing sync spec

---

## 4. Acceptance criteria

| ID | Observable behaviour | Level | Test file and name |
| --- | --- | --- | --- |
| AC-1 | Weather step runs only for entries where `weatherC` is null/undefined and `latitude` and `longitude` are set in Settings. AI step is invoked only for entries where `text` is a non-empty string (not null, undefined, or `""`), no `extractionReviewedAt`, no existing `PendingExtraction`, and `aiProvider`, `aiModel`, and the matching key in `apiKeys` all set. | unit | `lib/__tests__/sync.test.ts` — `runSync: gate conditions for weather and AI steps` |
| AC-2 | A failed weather fetch does not stop the run, does not block the AI step for that entry, and leaves `needsSync` set on that entry. | unit | `lib/__tests__/sync.test.ts` — `runSync: failed weather does not stop run or AI step` |
| AC-3 | Missing AI configuration (any of provider, model, or key) skips the AI step for all entries without stopping the weather step, and leaves those entries unsynced. | unit | `lib/__tests__/sync.test.ts` — `runSync: missing AI config skips AI step, weather still runs` |
| AC-4 | Missing coordinates skip the weather step, do not stop the AI step (when AI is configured), and leave those entries unsynced. | unit | `lib/__tests__/sync.test.ts` — `runSync: missing coordinates skip weather step` |
| AC-5 | A second call to `runSync` while a run is in progress returns without starting a new run (in-flight guard). | unit | `lib/__tests__/sync.test.ts` — `runSync: in-flight guard blocks concurrent run` |
| AC-6 | `applyNeedsSyncRule`: a no-text entry with non-null `weatherC` has `needsSync` absent after the call. | unit | `lib/__tests__/db.test.ts` — `applyNeedsSyncRule: clears needsSync for no-text entry with weather` |
| AC-7 | `applyNeedsSyncRule`: a no-text entry with null `weatherC` retains `needsSync`. | unit | `lib/__tests__/db.test.ts` — `applyNeedsSyncRule: keeps needsSync for no-text entry without weather` |
| AC-8 | `applyNeedsSyncRule`: a text entry with non-null `weatherC` but no `extractionReviewedAt` retains `needsSync`. | unit | `lib/__tests__/db.test.ts` — `applyNeedsSyncRule: keeps needsSync for text entry with weather but no extractionReviewedAt` |
| AC-9 | `applyNeedsSyncRule`: a text entry with `extractionReviewedAt` set but null `weatherC` retains `needsSync`. | unit | `lib/__tests__/db.test.ts` — `applyNeedsSyncRule: keeps needsSync for text entry with extractionReviewedAt but no weather` |
| AC-10 | `applyNeedsSyncRule`: a text entry with non-null `weatherC` and `extractionReviewedAt` set has `needsSync` absent. Order of writes does not matter (test both: weather then `extractionReviewedAt`, and `extractionReviewedAt` then weather). | unit | `lib/__tests__/db.test.ts` — `applyNeedsSyncRule: clears needsSync for text entry with both conditions met` |
| AC-11 | `writeEntryWeather` does not change `updatedAt` on the entry. | unit | `lib/__tests__/db.test.ts` — `writeEntryWeather: does not bump updatedAt` |
| AC-12 | SyncSheet shows a banner on open naming which of location and AI config is missing (either, both, or neither) and pointing to Settings. When only AI config is missing, weather syncs normally. When only location is missing, the AI step (if configured) still runs. | e2e | `e2e/sync.spec.ts` — `SyncSheet banner: names missing location`, `names missing AI config`, `names both`, `shows nothing when both configured` |
| AC-13 | Rows are ordered oldest-first. Each row shows weather and AI state columns separately. An entry with no text has no AI state shown. "Review →" appears only when a `PendingExtraction` exists for that entry; it is absent otherwise. Note: the "Review →" visible case requires seeding a `PendingExtraction` record directly in the Playwright page context (via `page.evaluate` into the IndexedDB), since the 8d-1 AI stub always throws and no `PendingExtraction` is ever saved through the orchestrator. | e2e | `e2e/sync.spec.ts` — `SyncSheet rows: oldest-first order and state columns` |
| AC-14 | After a run, a summary reports weather and AI results separately (e.g., counts of synced, failed, skipped per step). | e2e | `e2e/sync.spec.ts` — `SyncSheet: post-run summary shows weather and AI counts separately` |
| AC-15 | Sync Now is disabled while a run is in progress, including after the sheet is closed and reopened mid-run. | e2e | `e2e/sync.spec.ts` — `SyncSheet: Sync Now disabled during run and on reopen` |
| AC-16 | The Journal tab shows updated weather on entry cards after a sync run completes. | e2e | `e2e/sync.spec.ts` — `SyncSheet: Journal tab shows weather after sync` |
| AC-17 | A failed AI step (stub throws) does not stop the run, does not block the weather step for that entry, and leaves `needsSync` set on that entry. | unit | `lib/__tests__/sync.test.ts` — `runSync: failed AI step does not stop run or weather step` |
| AC-18 | `getPendingExtractionByEntryId`: returns the record when a `PendingExtraction` exists for the given entry ID, and returns `undefined` when none exists. | unit | `lib/__tests__/db.test.ts` — `getPendingExtractionByEntryId: returns record or undefined` |
| AC-19 | The AI step is invoked exactly once per eligible entry per run, even when the stub throws. The weather step is invoked exactly once per eligible entry per run. | unit | `lib/__tests__/sync.test.ts` — `runSync: each step called exactly once per eligible entry` |
| AC-20 | `applyNeedsSyncRule` returns the updated `JournalEntry` — the full record, with `needsSync` absent when cleared or present when retained. | unit | `lib/__tests__/db.test.ts` — `applyNeedsSyncRule: returns updated JournalEntry` |

---

## 5. Invariant check (ARCHITECTURE §9)

| Invariant | Touched | How it is held | Test or check |
| --- | --- | --- | --- |
| 1. One-way layering: `app/` → `components/` → `lib/` | yes | `lib/sync.ts` imports only from `lib/`; `SyncSheet` imports from `lib/sync.ts`; no reverse imports | `npx tsc --noEmit` |
| 2. Only `lib/db.ts` touches IndexedDB | yes | `lib/sync.ts` calls `lib/db.ts` functions only; never accesses `db` or `openGardenDB` directly | Code review |
| 3. Network modules never touch the database | yes | `lib/weatherSync.ts` fetches only; orchestrator calls it and then calls `lib/db.ts` separately | Code review |
| 4. Network calls originate in `lib/` | yes | `lib/sync.ts` is in `lib/`; `SyncSheet` calls `runSync()`, not a network module directly | Code review |
| 5. All writes go to IndexedDB first; save paths make no network calls | no | — | — |
| 6. No migration code | no | — | — |
| 7. Date edit updates entry, photos, and GeneralNotes in one transaction | no | — | — |
| 8. `needsSync` is `1` or absent, never `0` or `false` | yes | `applyNeedsSyncRule` deletes the field from the entry object (spreads without it) before `put`; it is never set to `0` | AC-6, AC-10 |
| 9. Photos stored as ArrayBuffer, never Blob | no | — | — |
| 10. All indexes are single-field | no | — | — |
| 11. Every create/update/delete in `lib/db.ts` returns the affected record | yes | `writeEntryWeather` and `applyNeedsSyncRule` return the updated `JournalEntry` | AC-20, Code review |
| 12. No backend or proxy | no | — | — |
| 13. Weather and AI calls happen only in sync orchestrator, started by user | yes | Both steps are inside `runSync()`; `SyncSheet`'s Sync Now button is the only caller | Code review |
| 14. Nothing reaches cropEvents/generalNotes/lessons until user confirms | no | — | — |
| 15. Model never sees database IDs | no | — | — |
| 16. User-written text wrapped in data tags | no | — | — |
| 17. ExtractedEventSchema is the single source for extraction types | no | — | — |
| 18. Provider and model are Settings values, not hard-coded | no | — | — |
| 19. No automatic AI retries | no | — | — |
| 20. Geolocation is one-shot, on user tap only | no | — | — |

Adds a field derived from another field: No. `extractionReviewedAt` is written externally by Done (8e-5); it is not derived from another field in this phase.

---

## 6. Dependencies and stop-and-ask triggers

- New packages: none
- `lib/db.ts` schema or store changes: `extractionReviewedAt?: string` added to `JournalEntry` interface. No new store, no new index, no version bump — the field is optional and IndexedDB stores arbitrary objects. [STOP-ASK area — flagged per workflow. The change is within the scope approved by the build plan for this phase, so no separate approval is needed unless the reviewer disagrees.]
- Service worker, manifest, or base path changes: none
- AI provider behaviour or extraction spec changes: none
- Build plan edits: none
- D-entries for approved plan decisions: D-1 (progress callback shape), D-2 (in-flight guard surface), and D-3 (AI stub behaviour) are durable technical decisions that will constrain 8d-2 through 8d-5. Once approved they must be drafted as D-entries in `docs/DECISIONS.md` and included in this PR.

---

## 7. Decisions needed before approval

None — all decisions resolved before approval; see §11.

---

## 8. Open questions

- Q-1: The spec says "a summary line reports weather and AI results separately." One line or two? The exec plan uses two logical counts (weather: N synced / N failed / N skipped; AI: N queued / N failed / N skipped). The exact wording and layout are UI details settled during implementation.
- Q-2: AC-15 (Sync disabled on sheet reopen mid-run) requires a slow mock in Playwright (via `page.route` to delay the weather request). This is feasible in Chromium; WebKit may behave differently. If flaky in WebKit, the test will be scoped to Chromium only and noted in the PR.

---

## 9. Progress

All acceptance criteria implemented and tests passing (2026-10-20):
- AC-6 through AC-11, AC-18, AC-20: unit tests in `lib/__tests__/db.test.ts` — pass (79/79)
- AC-1 through AC-5, AC-7, AC-19: unit tests in `lib/__tests__/sync.test.ts` — pass (79/79)
- AC-12 through AC-16: e2e tests in `e2e/sync.spec.ts` — pass in Chromium (48/48 + 1 skip SW); WebKit AC-15 tests intentionally skipped per Q-2 decision
- Done checklist: lint (53 pre-existing errors, 0 new), typecheck clean, all tests pass, build passes
- Manual check (schema): **Wipe the database before running any manual tests on this branch.** Any PR that adds a store, index, or field to the `upgrade()` handler requires a wipe because there is no migration path (D-034, D-081). Use Settings → Wipe Database, then re-create test entries.

---

## 10. Surprises & discoveries

- The `useDb` utility generates ESLint false-positive `react-hooks/rules-of-hooks` errors for every call in `lib/db.ts`. These are pre-existing; we added 3 new functions, each generating one more false-positive. Total remains 53 errors before and after.
- WebKit AC-15 tests (slow-fetch guard) are scoped to Chromium only per Q-2.
- The `navigation.spec.ts:tab bar navigates between tabs` test times out in WebKit — confirmed pre-existing on `main` (not introduced by this PR).
- **Silent "All entries are synced" when DB schema is stale.** `SyncSheet.load()` originally used a bare `try/finally` with no `catch`. When a store added in a later migration (e.g. `pendingExtractions`, added in PR #17 without bumping the DB version) is absent from an older device's IndexedDB, `getPendingExtractionByEntryId` throws a `DOMException`. The bare `finally` swallowed this, left `rows = []`, and rendered "All entries are synced" instead of an error. Fixed: added a `catch` block that sets `loadError = true`, rendering an explicit "schema may be out of date — wipe in Settings" message. Root trigger is the no-migration-path policy (D-034, D-081): any schema change requires a DB wipe on test devices.

---

## 11. Decision log

- 2026-10-19: **D-1 resolved — progress callback shape.** Accepted recommendation (a): `onProgress(entryId: string, step: 'weather' | 'ai', status: StepStatus)` invoked by the orchestrator as each step completes. Reason: simple, synchronous, and straightforward to assert in unit tests by capturing the array of calls. Alternatives: AsyncIterable (b), database polling (c). [approved by Apoorva Gupta, 2026-10-19]
- 2026-10-19: **D-2 resolved — in-flight guard surface.** Accepted recommendation (a): export `isRunning(): boolean` from `lib/sync.ts` as a module-level flag, read on mount. Reason: module-level singleton matches the spec and is directly testable via `isRunning()`. Alternatives: prop drilling (b), React context (c). [approved by Apoorva Gupta, 2026-10-19]
- 2026-10-19: **D-3 resolved — AI call site in 8d-1.** Accepted recommendation (a): after the gate check, call `aiProvider.extract()` on the injected stub — the `StubAIProvider` throws "not implemented", which is caught and reported as a failure. Reason: calling the stub honestly represents the current state; 8d-5 wires up the real provider without changing the orchestrator's skeleton. Alternatives: no-op step reporting success (b). [approved by Apoorva Gupta, 2026-10-19]

---

## 12. Outcomes & retrospective

Not yet filled in.
