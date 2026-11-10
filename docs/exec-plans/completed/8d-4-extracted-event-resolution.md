# Exec plan: 8d-4 — Extracted event resolution

Build plan: docs/BUILD_PLAN.md, phase 8d-4
Approved: ,    (blank until approved)

Rules for this file:

- Sections 1 to 8 are the approved contract. Do not change them without an approved plan change (section 11).
- Sections 9 to 11 are living. Update them as work proceeds.
- Write "None" for any section with nothing to record. Do not invent entries.
- Checklists appear only in section 9.

## 1. Purpose

This phase delivers `resolveExtractedEvents()`, a pure function that turns the validated events from an extraction call into one pending `EventReview` per event, with every database ID resolved by app code rather than taken from the model. It resolves `matchedRosterName` to a crop type ID by exact comparison (D-062), `linkedProblemRef` to a problem ID through the 8d-2 label map (D-063), and clamps a null or out-of-bound `eventDate` to the entry's date (D-093). This is the step named "app code resolves both after parsing" in the AI trust boundary (`ARCHITECTURE.md` §5, invariant I-15). It depends on 8b (the `EventReview` type) and 8d-2 (the label map) and makes no network or database calls. It touches `ARCHITECTURE.md` §5 (AI trust boundary) and §9 invariants I-2, I-14, I-15, I-17.

---

## 2. Scope

### In scope

- `lib/ai/eventResolver.ts` (new):
  - `resolveExtractedEvents(events: ExtractedEvent[], roster: CropType[], labelMap: Record<string, string>, entryDate: string): EventReview[]`.
  - Returns one `EventReview` per input event, in input order, each with `status: 'pending'`.
  - `extracted` holds the input `ExtractedEvent` unmodified (same object content; no field is rewritten).
  - `resolvedCropTypeId`: for events whose `eventType` is `general`, always `null` (general events skip crop resolution). For every other type, the crop type whose name matches `matchedRosterName` by an exact, trimmed, `toLowerCase()` comparison, or `null` when `matchedRosterName` is `null` or matches no roster name. No fuzzy matching (D-062).
  - `resolvedLinkedProblemId`: `labelMap[linkedProblemRef]` when `linkedProblemRef` is a non-null label present in the map, otherwise `null`. The label itself never appears in any resolved field (D-063). `extracted.linkedProblemRef` keeps the raw label because `extracted` is preserved unmodified.
  - `resolvedInstanceId`: always `null` here; instance resolution is 8e-3.
  - `resolvedDate` (new `EventReview` field, see §6 and §7 D-1): the event's resolved date. Equals `extracted.eventDate` when that is a valid `YYYY-MM-DD` date inside the bound (§7 D-2); otherwise falls back to `entryDate`.
  - `id`: a fresh `nanoid()` per review (consistent with the ID generation in `lib/db.ts`). `edits` is left unset.
  - No network calls, no database access.
- `lib/db.ts` [STOP-ASK]: add a required `resolvedDate: string` field to the `EventReview` interface. No new store, no new index, no schema-version change (see §6).
- `lib/__tests__/eventResolver.test.ts` (new): all unit tests for `resolveExtractedEvents`.
- `docs/ARCHITECTURE.md`: add a §2 code-map row for `lib/ai/eventResolver.ts` and a short §5 "Event resolution" description. (In the PR for review.)
- `docs/DECISIONS.md`: add one D-entry recording the resolution contract and the new `EventReview.resolvedDate` field, which 8e-3 and 8e-5 consume. (In the PR for review.)

### Out of scope

- Persisting the reviews — saving a `PendingExtraction` is 8d-5. This function returns `EventReview[]` to its caller and writes nothing.
- Resolving the crop instance (`resolvedInstanceId` stays `null`); that is 8e-3, which looks up the instance for the entry's year.
- Building the extraction request and the label map (8d-2) and calling the provider (8d-3); their outputs are inputs here.
- Wiring `resolveExtractedEvents` into the sync orchestrator (8d-5).
- Any card UI, Confirm/Dismiss/Done, or edits (`edits` is left unset here); those are 8e-2 and 8e-4.

---

## 3. Files

**lib/db.ts**
- `lib/db.ts` [STOP-ASK: stored type shape change] — add `resolvedDate: string` to the `EventReview` interface. No store, index, or schema-version change.

**lib/ai/**
- `lib/ai/eventResolver.ts` — new file. `resolveExtractedEvents` and any local helper for the date bound.

**Tests**
- `lib/__tests__/eventResolver.test.ts` — new file.

**Docs** (in the PR for explicit review)
- `docs/ARCHITECTURE.md` — new §2 code-map row for `lib/ai/eventResolver.ts`; new §5 "Event resolution" description.
- `docs/DECISIONS.md` — new D-entry (draft in §11) for the resolution contract and `EventReview.resolvedDate`. Confirm the next free D-number at PR time; do not renumber existing entries.

---

## 4. Acceptance criteria

Each criterion is a test written first and confirmed to fail for the right reason.

| ID | Observable behaviour | Level | Test file and name |
| --- | --- | --- | --- |
| AC-1 | For a non-`general` event, `matchedRosterName` resolves to the roster crop type's `id` regardless of letter case and surrounding whitespace (e.g. `"  tomatoes  "` and `"TOMATOES"` both resolve to the `Tomatoes` crop's id). A `null` `matchedRosterName`, and a misspelled name with no exact normalized match (e.g. `"Tomatos"`), both resolve `resolvedCropTypeId` to `null`. | unit | `lib/__tests__/eventResolver.test.ts` — `resolveExtractedEvents: crop name match is case- and whitespace-insensitive; null and misspelled resolve to null` |
| AC-2 | An event with `eventType: 'general'` and a non-null `matchedRosterName` that exactly matches a roster name still resolves `resolvedCropTypeId` to `null` — general events skip crop resolution. | unit | `lib/__tests__/eventResolver.test.ts` — `resolveExtractedEvents: general events skip crop resolution` |
| AC-3 | A known label (a key of `labelMap`) resolves `resolvedLinkedProblemId` to the mapped problem `id`. An unknown label and a `null` `linkedProblemRef` both resolve it to `null`. No resolved field equals the label string (e.g. `"P1"`); the label appears only in the preserved `extracted.linkedProblemRef`. | unit | `lib/__tests__/eventResolver.test.ts` — `resolveExtractedEvents: label resolves to problem id via labelMap; unknown and null resolve to null; no label in resolved fields` |
| AC-4 | Date fallback against the bound (same calendar year as `entryDate`, §7 D-2): a `null` `eventDate`, an unparseable date string, and an out-of-bound date at each edge (`entryYear-1` `-12-31` and `entryYear+1` `-01-01`) each set `resolvedDate` to `entryDate`. An in-bound date, including both edges `entryYear-01-01` and `entryYear-12-31`, is kept as `resolvedDate`. | unit | `lib/__tests__/eventResolver.test.ts` — `resolveExtractedEvents: resolvedDate keeps in-bound dates and falls back at both edges, on null, and on invalid input` |
| AC-5 | The function returns exactly one `EventReview` per input event, in input order. Every returned review has `status: 'pending'`, `resolvedInstanceId: null`, no `edits`, and an `extracted` field that deep-equals the corresponding input event (unmodified). | unit | `lib/__tests__/eventResolver.test.ts` — `resolveExtractedEvents: one pending review per event with extracted preserved unmodified` |
| AC-6 | Every ID in the output comes from the supplied roster or label map, never from the model response: `resolvedCropTypeId` is either a roster crop type `id` or `null`, and `resolvedLinkedProblemId` is either a `labelMap` value or `null`. An event whose `matchedRosterName`/`linkedProblemRef` carry id-like strings not present in the roster or map resolves both to `null`. | unit | `lib/__tests__/eventResolver.test.ts` — `resolveExtractedEvents: resolved IDs come only from roster and labelMap` |
| AC-7 | On the installed app, after pulling this branch, wipe the local database before testing (`EventReview` gains the required `resolvedDate` field, changing the shape of records stored in the `PendingExtraction.events` array). The wipe is mandatory per the stored-type-shape-change rule. In practice no built phase writes a `PendingExtraction` until 8d-5, so a current device holds no data of the old shape; the wipe is still performed as the required step. | manual | On-device — checked in the installed home-screen app (pending). |

---

## 5. Invariant check (ARCHITECTURE §9)

| Invariant | Touched | How it is held | Test or check |
| --- | --- | --- | --- |
| 1. Dependencies run one way: `app/` → `components/` → `lib/`. `lib/` never imports from `components/` or `app/`, and `components/` never imports from `app/`. | yes | `eventResolver.ts` lives in `lib/ai/`; it imports `CropType`, `EventReview` from `lib/db.ts`, `ExtractedEvent` from `lib/ai/extractionSpec.ts`, and `nanoid` only — no imports from `components/` or `app/`. | `npx tsc --noEmit`, `npm run lint` |
| 2. Only `lib/db.ts` touches IndexedDB. | yes | `resolveExtractedEvents` is pure and opens no database; it only reads its arguments and returns an array. | AC-5, AC-6; code review |
| 3. Network-facing modules (`lib/weatherSync.ts`, `lib/orchestrator/geocode.ts`, AI providers) never touch the database. The sync orchestrator reads and writes; they only fetch. | no | `eventResolver.ts` is neither network-facing nor database-touching. | — |
| 4. Network calls originate in `lib/`. | no | No network calls in this phase. | — |
| 5. All writes go to IndexedDB first. Save paths make no network calls. | no | Not applicable; the function performs no writes. | — |
| 6. No migration code. The `upgradeneeded` handler creates all stores from scratch, with no version checks. A startup `isSchemaValid` check detects when the local DB is missing a store or index; it is not a migration (D-101). If it fails, the app blocks on a wipe prompt before any data is read. | yes | Adding `resolvedDate` to the embedded `EventReview` type changes no store and no index, so `openGardenDB` and the `isSchemaValid` check are unaffected and no migration code is added. | `npm run test` (schema-guard tests pass unchanged) |
| 7. A date edit updates the entry, all its photos' `entryDate`, and all its `GeneralNote` dates in one `readwrite` transaction spanning the stores (§3). | no | Not applicable; no entry or date edit happens here. | — |
| 8. `needsSync` is `1` or absent, never `0` or `false` (§3). | no | Not applicable; no `needsSync` write. | — |
| 9. Photos are stored as `ArrayBuffer`; the store never contains a `Blob` (§3). | no | Not applicable. | — |
| 10. All indexes are single-field (§3). | yes | No index is added; the new `resolvedDate` field is not indexed. | code review |
| 11. Every create, update, and delete function in `lib/db.ts` returns the affected record (D-036). | no | No create/update/delete function is added or changed; only the `EventReview` interface gains a field. | — |
| 12. No backend or proxy. | no | Not applicable. | — |
| 13. Weather and AI calls happen only in the sync orchestrator, started by the user, never at save. | no | `resolveExtractedEvents` makes no AI call; it processes an already-returned response. | — |
| 14. Nothing reaches `cropEvents`, `generalNotes`, or `CropType.lessons` until the user confirms that card. | yes | The function only produces `pending` reviews and writes to no store; confirmation and commit are 8e. | AC-5 (status `pending`); code review (no DB access) |
| 15. The model never sees database IDs. `matchedRosterName` is a name and `linkedProblemRef` is an ephemeral label; app code resolves both after parsing. | yes | This function is that resolution step: `resolvedCropTypeId` comes only from the roster, `resolvedLinkedProblemId` only from `labelMap`; no ID is taken from the model response, and the raw label never appears in a resolved field. | AC-1, AC-2, AC-3, AC-6 |
| 16. User-written text in the extraction prompt (entry text, `nextSeasonNote`, crop names, problem excerpts) is wrapped in explicit data tags. | no | Prompt construction is 8d-2; this phase does not build a prompt. | — |
| 17. `ExtractedEventSchema` is the single source for extraction types. Derive the tool schema and the TypeScript type from it; never write a second one. | yes | `EventReview.extracted` is typed as `ExtractedEvent` (derived from `ExtractedEventSchema`); the new `resolvedDate` field is on `EventReview`, which is a review-state wrapper, not a second extraction schema. | `npx tsc --noEmit`; code review |
| 18. Provider and model are Settings values. No provider name or model ID appears in source code. | no | No provider or model literal in `eventResolver.ts`. | — |
| 19. No automatic AI retries. | no | Not applicable; no AI call. | — |
| 20. Geolocation is one-shot, requested only on user tap. `watchPosition` is never used. | no | Not applicable. | — |

Adds a field derived from another field: **No** in the denormalized-cascade sense of §3. `resolvedDate` is a one-time resolution result (like the existing `resolvedCropTypeId`), not a denormalized copy kept in sync with a source field — `extracted.eventDate` is preserved unchanged and there is no cascade rule linking the two. No §3 cascade table row and no cascade rollback test are required.

---

## 6. Dependencies and stop-and-ask triggers

- New packages: none. `nanoid` is already a dependency used throughout `lib/db.ts`.
- `lib/db.ts` schema or store changes: **[STOP-ASK]** — the `EventReview` interface gains a required `resolvedDate: string` field. `EventReview` is embedded inside the `PendingExtraction` store's `events` array; it is not a store of its own and has no index. This change adds no store and no index and bumps no schema version, so `openGardenDB` and the `isSchemaValid` guard (D-101) are unaffected. Because the field changes the shape of records stored in the `PendingExtraction.events` array, the stored-type-shape-change rule applies and AC-7 states a **mandatory** on-device DB wipe before testing. In practice no built phase writes a `PendingExtraction` until 8d-5, so a current device holds no data of the old shape, but the wipe is required regardless. This change is within the build-plan scope for 8d-4, which requires the function to resolve dates; the field is the place the resolved date is stored.
- Service worker, manifest, or base path changes: none.
- AI provider behaviour or extraction spec changes: none. `ExtractedEventSchema` is unchanged; `EventReview` is a review-state type, not the extraction schema.
- Build plan edits: none.

---

## 7. Decisions needed before approval

- **D-1: Where the resolved event date is stored.** The build plan requires `resolveExtractedEvents` to clamp a null or out-of-bound `eventDate` to the entry date, and the Done-when requires `extracted` to stay unmodified. `EventReview` (defined in 8b) has no date field, so the resolved date needs a home.
  - (a) Add a required `resolvedDate: string` field to `EventReview`, set by this function. 8e-5 reads it to set `CropEvent.date`/`year`. **[STOP-ASK: touches `lib/db.ts`]**
  - (b) Write the clamped date back into `extracted.eventDate`. Rejected: violates the Done-when that `extracted` holds the validated AI event unmodified, and erases the model's original output needed for evaluation (D-091).
  - (c) Do not store it in 8d-4; recompute the fallback at commit in 8e-5. Rejected: the build plan assigns date resolution to 8d-4, and recomputation would duplicate the logic and leave 8d-4's date Done-when untestable on the output.
  - **Recommendation: (a).** It is the only option consistent with both Done-when clauses and keeps `resolvedDate` beside the other resolved fields (`resolvedCropTypeId`, `resolvedInstanceId`, `resolvedLinkedProblemId`). It is a cross-phase interface (consumed by 8e-3 for the instance lookup year and 8e-5 for the committed `CropEvent`), so it needs a permanent D-entry in `docs/DECISIONS.md` (drafted in §11), not only a §11 entry here.

- **D-2: The "sane bound" for `eventDate`.** The bound decides which model dates are kept versus clamped to the entry date, and must be stated here and tested at both edges.
  - (a) The event date must parse as a valid `YYYY-MM-DD` date and fall in the **same calendar year as the entry date**. Edges: `entryYear-01-01` and `entryYear-12-31` are kept; `entryYear-1-12-31` and `entryYear+1-01-01` fall back.
  - (b) A `±N`-day window around the entry date (e.g. ±366 days). Can cross a year boundary.
  - **Recommendation: (a).** `CropEvent.year` is derived from the event date (D-026) and 8e-3 looks up the crop instance for *the entry's year*; keeping the resolved date inside the entry's year keeps those consistent and matches the year constraint on entry-date edits (D-088). It is also the simplest bound to test at both edges. Option (b) can place a `CropEvent` in a different year than its entry, mismatching the 8e-3 instance lookup. A date that is a valid `YYYY-MM-DD` but outside the entry's year, and a syntactically invalid date string, both fall back to the entry date.

- **D-3: `resolveExtractedEvents` takes `entryDate: string`, not the whole `JournalEntry`.** The build plan phrases the input as "the entry," but the function needs only the entry's date (for the fallback) and generates its own review IDs. Options: (a) `entryDate: string`; (b) the full `JournalEntry`. **Recommendation: (a)** — the input type then contains exactly what the function needs directly, matching the 8d-2 retrospective guidance, and keeps tests from constructing a full entry. The caller (8d-5) already has the entry and passes `entry.date`. This is a narrowing of the build-plan wording, within scope.

- **D-5: Interpretation of "No label appears in the output" (build-plan clarification).** The 8d-4 Done-when has two items in tension: "No label appears in the output" and "`extracted` is unmodified." Since `extracted` is preserved unchanged, the raw `linkedProblemRef` label (e.g. `"P1"`) necessarily remains inside `extracted.linkedProblemRef`.
  - (a) Interpret "the output" as the resolved fields that drive app behaviour (`resolvedLinkedProblemId`, `resolvedCropTypeId`, `resolvedDate`, `resolvedInstanceId`). The preserved `extracted` is an audit trail of the model response, not a resolved value. AC-3 tests this: no resolved field equals the label; the label survives only in `extracted.linkedProblemRef`.
  - (b) Strip the label from `extracted` too, setting `extracted.linkedProblemRef` to `null`. Rejected: violates the "`extracted` unmodified" Done-when and D-091 (preserve raw model output for evaluation).
  - **Recommendation: (a).** Consistent with both Done-when clauses and D-091; a label in a resolved field would be a model-supplied identifier reaching app logic, which I-15 forbids, but the label in `extracted` is audit data, not a resolved value. This clarifies, and does not narrow, the build-plan Done-when. **[requires approval: approved by Apoorva Gupta, 2026-11-09]**

---

## 8. Open questions

None.

---

## 9. Progress

- [x] 2026-11-09 21:39Z: AC-1..AC-6 tests written first; Vitest failed because `../ai/eventResolver` did not exist.
- [x] 2026-11-09 21:39Z: AC-1..AC-6 passing (7 tests), including invalid calendar dates, inherited label keys, fresh IDs, empty input, and duplicate-name ordering.

---

- [x] 2026-11-09 21:42Z: Full unit suite passes (137 tests); typecheck passes. Targeted lint including `lib/db.ts` reports 47 existing errors (explicit-any / useDb hook naming); no resolver/test errors reported. Full lint, E2E and build blocked by existing worktree copies / sandbox restrictions (see §10).
- [x] 2026-11-09 23:15Z: `9ae4d6c` committed — `resolveExtractedEvents` implementation, tests, `EventReview.resolvedDate` in `lib/db.ts`, ARCHITECTURE §2/§5, and D-108 in `docs/DECISIONS.md`.
- [x] 2026-11-09 23:16Z: Reviewer A round 1 — BLOCKING: commit-level TDD evidence absent; lint, E2E, and build not verified locally or in CI. Non-blocking: add general-event problem-link test.
- [x] 2026-11-09 23:16Z: Reviewer B round 1 — BLOCKING: lint, E2E, and build not verified locally or in CI.
- [x] 2026-11-09 23:22Z: Fix agent round 1 — general-event `P1` test added, 138 unit tests pass, baseline lint/E2E/build comparison supplied; staging and commit blocked by read-only `.git`. FIX-RESULT: NEEDS-HUMAN.
- [x] 2026-11-09 23:24Z: `dd00556` committed — general-event problem-link test; §10 updated with baseline verification results.
- [x] 2026-11-09: Human disposition — §9 failing-run log accepted as sufficient TDD evidence; no separate failing-test commit required. Baseline lint failures (13,414, identical count on `main`) and pre-existing WebKit E2E timeout accepted as not regressions; CI results authoritative for merge. Re-review requested at SHA `dd00556`.
- [x] 2026-11-09: Human comment — AC-7 mandatory-wipe instruction overly conservative; no `PendingExtraction` exists on-device until 8d-5. Revised: open the installed app after pulling, confirm normal operation; wipe only if `PendingExtraction` was manually inserted via devtools.
- [x] 2026-11-09 23:31Z: Fix agent round 2 — plan §11 and D-108 updated with revised AC-7 wording; staging and commit blocked by read-only `.git`. FIX-RESULT: NEEDS-HUMAN.
- [x] 2026-11-09 23:36Z: `2c8e60b` committed — AC-7 wording correction in plan §11 and D-108.
- [x] 2026-11-09 23:37Z: Reviewer A round 2 — APPROVED. Non-blocking: PR body stale (still prescribes mandatory wipe).
- [x] 2026-11-09 23:37Z: Reviewer B round 2 — APPROVED. Non-blocking: PR body stale (still instructs DB wipe).
- [x] 2026-11-09: Human FLOW-VERDICT APPROVED at SHA `2c8e60b447d5fbfff3fdb5bb19a9f3b96e64334a`.

## 10. Surprises & discoveries

- 2026-11-09 human disposition after fix report: the §9 failing-run log is accepted as sufficient TDD evidence; no separate historical failing-test commit is required. The supplied baseline comparison and successful build, typecheck, and 138 unit tests are accepted; CI results are authoritative for merge. These dispositions supersede the unresolved status recorded below.
- 2026-11-09 manual-check clarification: the installed-app check remains pending. Use the revised AC-7 instructions in §11; no database wipe is needed unless a `PendingExtraction` was manually inserted via devtools.

- 2026-11-09 fix review: commit-level TDD evidence remains unavailable. Section 9 records the original missing-module failure before implementation; the supplied orchestrator context confirms that read-only `.git` prevented separate commits. Commit `9ae4d6c` combines tests and implementation. This is session-level evidence only, not the requested failing-test commit followed by a passing-source commit; no retrospective history has been fabricated. Human disposition is required.
- 2026-11-09 fix review: the orchestrator reports subsequent manual verification outside the restricted session: lint has 13,414 pre-existing problems identical on main and this branch; 137 unit tests pass; typecheck clean; build clean (the full build command includes the service-worker step); E2E has 110 passes and one pre-existing WebKit timeout unchanged from main. These are supplied results, not independently observed CI results. Lint and E2E remain failing gates under the Definition of done; CI evidence remains unavailable. Fixing baseline failures outside the approved contract requires human scope direction.
- 2026-11-09 fix review: added the missing general-event `P1` test, asserting problem-ID resolution, skipped crop resolution, and preservation of the raw extraction label. `npm run test` passes all 138 tests (10 files); `npx tsc --noEmit` exits 0. No implementation source changed. On-device AC-7 remains pending.

- 2026-11-09: Blocked: `npm run lint` scans pre-existing untracked `.claude/worktrees/` copies and reports 13,414 problems (1,646 errors, 11,768 warnings). Changing ESLint configuration or other worktrees is outside the approved files; no changes made there.
- 2026-11-09: Blocked: `npm run test:e2e` cannot start the configured server: `listen EPERM: operation not permitted 0.0.0.0:3000`. Sandbox approval is unavailable. Needs a run in an environment permitting the server to listen.
- 2026-11-09: Blocked: `npm run build` fails in Turbopack while processing `app/globals.css`: `creating new process` → `binding to a port` → `Operation not permitted (os error 1)`. The service-worker build consequently did not run. Needs an environment permitting the internal port binding.


---

- 2026-11-09: Blocked: staging and commit fail with `Unable to create .git/index.lock: Operation not permitted`. The environment grants read-only access to `.git`; no commit was created.
- 2026-11-09 23:31Z: Fix agent round 2 also blocked by read-only `.git`: the same `index.lock` error prevented committing the §11/D-108 documentation update. The environment restriction persisted through both fix cycles; the orchestrator committed `2c8e60b` manually.

## 11. Decision log

- 2026-11-09: **Human-approved AC-7 manual-check correction (PR #78 comment after the fix report).** Revised manual check: "Open the installed app after pulling this branch, confirm normal operation — no DB wipe needed unless you manually inserted a `PendingExtraction` via devtools." No built phase writes a `PendingExtraction` until 8d-5, so normal device data contains no old-shape extraction records. This instruction supersedes the mandatory-wipe wording in AC-7 (§4) and §6 for this phase. Sections 1–8 are retained unchanged as the approved historical contract. The on-device check remains pending; a Safari tab does not count. D-108 is updated to match this guidance.

- 2026-11-09: **D-1 (plan): `EventReview` gains `resolvedDate: string`; `resolveExtractedEvents` sets it.** The function clamps a null/out-of-bound `eventDate` to the entry date while keeping `extracted` unmodified, so the resolved date needs its own field. Reason: only option consistent with both Done-when clauses; keeps the resolved date beside the other resolved IDs. Alternatives: writing back into `extracted.eventDate` (rejected — mutates the preserved AI output, D-091) or recomputing at commit in 8e-5 (rejected — duplicates logic, leaves 8d-4 untestable). Touches `lib/db.ts` (stop-and-ask). [requires approval: approved by Apoorva Gupta, 2026-11-09]
- 2026-11-09: **D-2 (plan): the `eventDate` sane bound is "same calendar year as the entry date."** A valid `YYYY-MM-DD` inside the entry's year is kept; null, invalid, or outside-the-year dates fall back to the entry date. Reason: keeps `CropEvent.year` (D-026) and the 8e-3 instance-year lookup consistent, matches D-088, and is simple to test at both edges. Alternative: a ±N-day window (rejected — can cross a year boundary and mismatch the instance lookup). Confirmed by Apoorva Gupta, 2026-11-09.
- 2026-11-09: **D-3 (plan): `resolveExtractedEvents` takes `entryDate: string`, not the whole `JournalEntry`.** Reason: the function needs only the date; a narrow input matches the 8d-2 retrospective guidance and simplifies tests. Alternative: pass the full entry (rejected — more than the function needs). Narrows the build-plan wording "the entry"; within scope. Confirmed by Apoorva Gupta, 2026-11-09.
- 2026-11-09: **D-4 (plan): draft permanent D-entry for the resolution contract.** A new `docs/DECISIONS.md` entry will record that `resolveExtractedEvents` resolves `matchedRosterName`→crop type id (exact, trimmed, lowercase), `linkedProblemRef`→problem id via `labelMap`, clamps `eventDate` to the entry's year, and stores the resolved date in the new `EventReview.resolvedDate`; `resolvedInstanceId` stays null until 8e-3. This is a cross-phase interface consumed by 8e-3 and 8e-5, so it needs a durable D-entry, not only this §11 entry. Confirm the next free D-number at PR time (latest is D-107; `docs/DECISIONS.md` currently has two entries numbered D-101 — do not renumber, just pick the next unused number). Draft:
  > **D-1xx — `resolveExtractedEvents` resolution contract and `EventReview.resolvedDate`**
  > **Type:** Technical · **Status:** Current · **Phase:** 8d-4
  > **Context:** Phase 8d-4 resolves the validated extraction output into pending review cards. The model returns names and ephemeral labels only (I-15); app code must resolve them to database IDs, and clamp the event date. `EventReview` (8b) had no date field.
  > **Decision:** `resolveExtractedEvents(events, roster, labelMap, entryDate)` returns one pending `EventReview` per event. `resolvedCropTypeId` is the roster crop type matched to `matchedRosterName` by exact trimmed lowercase comparison (D-062), or null; `general` events skip crop resolution. `resolvedLinkedProblemId` is `labelMap[linkedProblemRef]` or null (D-063); the label never appears in a resolved field. `EventReview` gains a required `resolvedDate: string`, set to `extracted.eventDate` when it is a valid date in the entry's calendar year, otherwise `entryDate` (D-093, D-026). `resolvedInstanceId` stays null until 8e-3. `extracted` is preserved unmodified.
  > **Consequences:** 8e-3 reads `resolvedDate`'s year for the instance lookup; 8e-5 uses it for `CropEvent.date`/`year`. No model-supplied ID ever reaches the database (I-15).
- 2026-11-09: **D-5 (plan): build-plan clarification — "No label appears in the output" means no label in any resolved field that drives app behaviour.** The 8d-4 Done-when has two items in tension: "No label appears in the output" and "`extracted` is unmodified." Since `extracted` is preserved unchanged, the raw `linkedProblemRef` label necessarily remains inside `extracted.linkedProblemRef`. The approved interpretation reads "the output" as the resolved fields that drive app behaviour (`resolvedLinkedProblemId`, `resolvedCropTypeId`, `resolvedDate`, `resolvedInstanceId`), not the preserved `extracted` audit trail of the model response. AC-3 tests exactly this: no *resolved* field equals the label; the label survives only in `extracted.linkedProblemRef`. Reason: the raw label in `extracted` is the preserved model output needed for evaluation (D-091), not a resolved value; a label in a resolved field would be a model-supplied identifier reaching app logic, which I-15 forbids. Alternative considered: strip the label from `extracted` too (rejected — violates the "`extracted` unmodified" Done-when and D-091). This clarifies, and does not narrow, the build-plan Done-when. [requires approval: approved by Apoorva Gupta, 2026-11-09]

- 2026-11-09: **Q-1 (plan): `general` events resolve `linkedProblemRef` uniformly.** The build plan's Done-when calls out only "general events skip crop resolution." This plan resolves `linkedProblemRef` uniformly for every event type — a `general` event rarely carries a label, and an unknown label resolves to `null` anyway. No special skip behaviour for `general` events on the problem side. Confirmed by plan-reviewer (two passes, no flag).
- 2026-11-09: **Q-2 (plan): first roster match wins on duplicate trimmed-lowercase names.** If two roster crop types normalise to the same trimmed-lowercase name, `resolveExtractedEvents` resolves to the first match in roster order. Duplicate roster names are not expected; first-match is the simplest deterministic rule. Confirmed by plan-reviewer (two passes, no flag).

- 2026-11-09: Implementation uses own-property lookup for labels so inherited keys such as `toString` cannot resolve as problem IDs. Rationale: only labels supplied by the call belong to the map. Alternative: direct bracket lookup (rejected because it exposes prototype values).
- 2026-11-09: Date validation uses a strict format check and UTC round-trip to reject normalized invalid dates without timezone dependence. Alternative: accepting JavaScript date parsing alone (rejected because February 30 normalizes into March). Permanent resolution contract recorded as D-108.
- 2026-11-09: **Human disposition — TDD sequence evidence.** The §9 log entry "tests written first; Vitest failed because `../ai/eventResolver` did not exist" is accepted as sufficient evidence of the TDD sequence. No separate failing-test commit is required. Reason: read-only `.git` in the Codex environment prevented creating separate commits; the log entry is contemporaneous session evidence.
- 2026-11-09: **Human disposition — baseline verification.** Pre-existing lint failures (13,414 problems, identical count on `main`) and the pre-existing WebKit E2E timeout are accepted as not regressions introduced by this branch. Build, typecheck, and 138 unit tests pass. CI results remain authoritative for merge.

---

## 12. Outcomes & retrospective

## Delivered

`resolveExtractedEvents(events, roster, labelMap, entryDate)` in `lib/ai/eventResolver.ts` — a pure function turning validated AI extraction output into pending `EventReview` records. Resolves `matchedRosterName` → crop type ID (exact trimmed lowercase; `general` events skip crop resolution), `linkedProblemRef` → problem ID via `labelMap` (own-property lookup; label never reaches resolved fields), `eventDate` → `resolvedDate` clamped to the entry's calendar year, and sets `resolvedInstanceId: null` (deferred to 8e-3). `lib/db.ts` gains `EventReview.resolvedDate: string`. `docs/ARCHITECTURE.md` and `docs/DECISIONS.md` (D-108) updated. 138 unit tests pass across 10 files. Manual AC-7 (on-device check) remains pending.

## What differed from the plan

AC-7's mandatory-wipe language was overly conservative: no `PendingExtraction` exists on a current device until 8d-5. Clarified post-review: open the installed app and confirm normal operation; wipe only if a `PendingExtraction` was manually inserted via devtools. The approved §§1–8 wording is retained as the historical contract; the correction is recorded in §11 and D-108.

## What went well

- Pure function design made implementation, testing, and review clean. No network calls and no DB access meant every acceptance criterion could be an isolated unit test.
- Pre-approved decisions (D-1–D-5) answered every implementation question before work started; zero unplanned decisions were needed during coding.
- Unit tests were comprehensive and all passed on the first implementation attempt; no source rework was required.
- Human disposition on TDD evidence and baseline verification was fast and pragmatic, unblocking the review quickly.

## What was harder than expected

- The Codex sandbox blocked the entire verification chain: read-only `.git` prevented all staging and commits; no-port-binding prevented `npm run build` and `npm run test:e2e`; untracked `.claude/worktrees/` copies inflated lint counts to 13,414. This affected both the initial implementation and two subsequent fix rounds.
- Commit-level TDD evidence (a separate failing-test commit) could not be supplied because `.git` was read-only in the session that wrote the tests, requiring human disposition.
- Both fix rounds ended NEEDS-HUMAN because the fix agent could not commit; the orchestrator had to commit `2c8e60b` manually.
- AC-7's mandatory-wipe instruction created a documentation fix cycle after both reviewers had already issued APPROVED verdicts.

## Process changes

- **Codex allowlist design** (primary fix; covers all git-write and port-binding failures across orchestration breaks [step 4] and [step 7]): Implementer-STOPPED, implementer not committing, and fix-agent not committing share a single root cause — the Codex sandbox does not grant git writes or port binding to writer roles. Design the Codex allowlist to give the implementer and fix-agent roles permission to run `git add`, `git commit`, and bind a port for `npm run build` and `npm run test:e2e`, without widening permissions for read-only roles (plan-writer, plan-reviewer, reviewers, retro-writer). The implementer and fix-agent prompt mitigations below are interim only; once the allowlist grants these capabilities they can be removed.

- **Implementer prompt** (`.flow/prompts/implementer.md`) — _interim until Codex allowlist is fixed_ (orchestration break [step 4] PROCESS IMPROVEMENT): Add a section distinguishing environment limitations (read-only `.git`, no port binding) from real implementation blockers. Instruct the implementer to emit `IMPLEMENTER: DONE` when implementation and unit tests are complete, and to record environment limitations in §10 rather than emitting `IMPLEMENTER: STOPPED`. Remove this guidance once the allowlist grants git writes and port binding to this role.

- **Fix-agent prompt** (`.flow/prompts/fix-agent.md`) — _interim until Codex allowlist is fixed_ (orchestration break [step 7]): When staging or committing fails with an `index.lock` or permissions error, instruct the fix-agent to record the intended commit content in the fix report and emit `FIX-RESULT: NEEDS-HUMAN (git-blocked)` rather than retrying. Remove this guidance once the allowlist grants git writes to this role.

- **Smoke-test commands file**, step 7 and step 4.5 — PR body update mechanism (orchestration break [step 7]): The fix-agent prompt prohibits `gh` commands, so the PR body is never updated after the initial `gh pr create` at step 4.5. Add a step between step 7 and step 8 for the orchestrator to update the PR body via `gh pr edit` after all fix rounds complete and both reviewers have approved, covering any scope or manual-check changes that surfaced during the fix cycle.

- **Smoke-test commands file**, step 3.5 — open-question gate (orchestration break [step 3.5] PROCESS IMPROVEMENT): The step 3.5 check greps §8 for `(Issue:` to find unresolved questions, but plan-writers sometimes self-resolve questions and mark them "Not expected to become an Issue," leaving §8 non-empty without the tag — which silently bypasses the gate. Add a second check after the `(Issue:` grep: if §8 contains any non-empty content not bearing the `(Issue:` tag, surface it to the human before deciding to skip step 3.5.

- **Smoke-test commands file**, step 7.5 — verdict format (orchestration break [step 7.5] PROCESS IMPROVEMENT): The step 7.5 verification grep expects `FLOW-VERDICT reviewer=a/b sha=... verdict=APPROVED`, but pr-reviewer prompts emit `VERDICT: APPROVED`. The three-comment SHA check can never pass as designed. Either update step 7.5 to match what the reviewer prompts actually emit, or update both reviewer prompts to prefix their verdict with `FLOW-VERDICT reviewer=<a|b> sha=<HEAD>` so the grep is reliable.

- **Retro-writer prompt** (`.flow/prompts/retro-writer.md`): Add "orchestration breaks log" to the required-reading list (step 4 or 5), and add an instruction in the §12 writing section to systematically process every `PROCESS IMPROVEMENT` entry in that log into a process change item naming the specific document to change and the proposed edit.
