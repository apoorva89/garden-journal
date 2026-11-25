# Exec plan: Extraction wiring and read-only cards

Build plan: docs/BUILD_PLAN.md, phase 8d-5
Approved: apoorva89, 2026-11-24 (confirmed in the workflow conversation)

Rules for this file:

- Sections 1 to 8 are the approved contract. Do not change them without an approved plan change (section 11).
- Sections 9 to 11 are living. Update them as work proceeds.
- Write "None" for any section with nothing to record. Do not invent entries.
- Checklists appear only in section 9.

## 1. Purpose

Phase 8d-5 closes the extraction pipeline: it connects the request builder (8d-2), the
provider call (8d-3/8d-3b), and the event resolver (8d-4) to the AI step of the sync
orchestrator (8d-1), and persists the result as a `PendingExtraction`. It also adds the
read-only review view behind the "Review →" link the SyncSheet already renders, so a user
can see the extracted events for an entry. This touches `ARCHITECTURE.md` §3 (the
`PendingExtraction` write) and §4 (the sync pipeline AI step and the review view). No Confirm,
Edit, Dismiss, or Done — those are Phase 8e.

## 2. Scope

### In scope

- Wire the sync orchestrator's AI step (currently a `StubAIProvider` call that always throws,
  D-100) to the real pipeline: for a text entry that passes the 8d-1 gate, build the request
  (`buildExtractionRequest`), call the provider through `runExtraction` (log-before-validate,
  D-067), resolve the validated events (`resolveExtractedEvents`), and save one
  `PendingExtraction` holding one pending `EventReview` per event.
- The orchestrator resolves each open problem's `cropInstanceId` to a crop name before calling
  `buildExtractionRequest` (D-063): the builder receives names already resolved.
- Populate `PendingExtraction.usage` from the usage `runExtraction` returns alongside the
  validated events (§7 D-1, resolved option b); `runExtraction` still writes the billing log
  before validation (D-067, D-106).
- When usage is absent, save valid events with `PendingExtraction.usage: null`, skip the usage log,
  and keep the review available without a SyncSheet warning.
- A `savePendingExtraction` mutation in `lib/db.ts` (uses the existing `pendingExtractions` store;
  no schema change).
- The read-only review view at the route the SyncSheet links to. It shows the entry text
  (read-only) and one read-only card per `EventReview` when the entry and its stored
  `PendingExtraction` both exist. If either is missing, the review content consists of
  “No extraction to review” and a “Back to Journal” link to `/journal` (§11 D-5).
  Each card shows the
  resolved crop name or "General", an event-type badge, the notes, and the linked problem
  reference as plain text. Crop name and problem reference are looked up from the stored
  resolved IDs (`resolvedCropTypeId`, `resolvedLinkedProblemId`), never from the model response.
- Remove the now-unused `StubAIProvider` class from `lib/ai/provider.ts` once the `lib/sync.ts`
  default that referenced it is gone (D-100); it has no other importers.
- A basic in-flight guard so the same entry cannot start a second extraction while one is
  outstanding (the existing module-level `isRunning` guard in `lib/sync.ts`, D-099).
- A failed call (transport or validation) saves no `PendingExtraction`, leaves the entry
  unsynced, and shows as `failed` on its SyncSheet row (8d-1 behaviour, unchanged).
- Doc updates: `ARCHITECTURE.md` §2 and §4; new/amended D-entries in `docs/DECISIONS.md`.

### Out of scope

- Confirm, Edit, Dismiss, Done, card state transitions, and the Done gate — Phase 8e-2/8e-4/8e-5.
  The cards in 8d-5 are display-only; no action commits anything (invariant 14 stays trivially
  held because nothing writes to `cropEvents`/`generalNotes`/`CropType.lessons`).
- The manual Retry button after a failure — Phase 8f-1 (#). The in-flight guard this phase adds
  is the one 8f-1 will reuse, but no Retry UI is built here.
- Re-run and staleness handling — Phase 8f-2/8f-3.
- Instance resolution (`resolvedInstanceId`) — Phase 8e-3. It stays `null` here (set by 8d-4).
- Photo section in the review view — Phase 8e-6.
- Any schema change. The `pendingExtractions` and `apiUsageLogs` stores already exist (8b); this
  phase only writes to and reads from them. No DB wipe is required.
- Showing token usage or cost in the review view. `PendingExtraction.usage` is stored but not
  displayed.

## 3. Files

**lib/db.ts** — allow `PendingExtraction.usage` to be null and add one function over the existing
store. No IndexedDB version, store, or index change. Existing numeric records remain readable.
- `savePendingExtraction(record: PendingExtraction): Promise<PendingExtraction>` — `put` to the
  existing `pendingExtractions` store; returns the record (invariant 11).

**lib/orchestrator/ai.ts**
- Change `runExtraction`'s return type to `{ events: ExtractedEvent[]; usage: { inputTokens:
  number; outputTokens: number } | null }`, returning the validated events and the usage from the
  same provider response (§7 D-1, resolved option b). It still resolves the provider via
  `getProvider(settings.aiProvider)` and writes the billing log before validation (D-067, D-106).
  No `provider` parameter is added (§7 D-2, resolved option c).
- Add `runEntryExtraction(params: { entry: JournalEntry; settings: Settings; database?: GardenDB
  }): Promise<PendingExtraction>` — the per-entry orchestration seam. Reads roster and instances,
  resolves open-problem crop names, builds the request, calls `runExtraction`, takes usage from
  `runExtraction`'s return, resolves events, and saves the `PendingExtraction`. Throws on transport
  or validation failure (nothing saved beyond the billing log already written by `runExtraction`).

**lib/sync.ts**
- Replace the stub `aiProvider.extract(...)` call in the AI step with `runEntryExtraction({ entry,
  settings })`, which resolves the provider internally via `getProvider` (§7 D-2, resolved option
  c). Remove the `StubAIProvider` import and default (D-100) and the now-dead `aiProvider` option
  from `SyncOptions`; no caller passes it and sync tests mock `getProvider` instead.
- Map a successful `runEntryExtraction` to `onProgress(..., 'ai', 'review-pending')` and a thrown
  error to `onProgress(..., 'ai', 'failed')`. The gate, the existing-`PendingExtraction` skip, and
  the in-flight guard are unchanged.

**lib/ai/provider.ts**
- Remove the `StubAIProvider` class. Removing the `lib/sync.ts` default above leaves it with no
  remaining importers (verified: the only source references were `lib/sync.ts` lines 11 and 41; no
  test imports it), so it is dead code. `AIProvider`, `getProvider`, and the result/config types are
  unchanged. This is the only incidental change the removal requires.

**components/journal/SyncSheet.tsx**
- Change the review link `href` from the path-segment form `/journal/sync/${id}/` to the
  query-param form `/journal/sync?id=${id}` (static-export-compatible, matches `EntryDetail`; see
  §7 D-3). No other change.

**app/(tabs)/journal/sync/page.tsx** [new]
- `Suspense` wrapper around `SyncReview`, mirroring `app/(tabs)/journal/entry/page.tsx`.

**app/(tabs)/journal/sync/SyncReview.tsx** [new]
- Client component. Reads `id` from `useSearchParams`, loads the entry and its
  `PendingExtraction` and the roster. Renders read-only entry text and one read-only card per
  `EventReview`. Resolves crop labels from stored IDs and loads the linked problem directly by
  `resolvedLinkedProblemId`, preserving the link selected from eligible open problems at
  extraction time even if its status later changes. If the entry or its `PendingExtraction` is missing, show
  “No extraction to review” and a “Back to Journal” link to `/journal` in place of the
  entry text and cards. The view makes no network calls and writes no records (§11 D-5).

**tests**
- `lib/__tests__/sync.test.ts` [extend] — AC-1, AC-2, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10,
  AC-11, AC-17. Sync tests mock `getProvider` to inject a fake provider and stay offline (§7 D-2).
  Existing tests that reached the AI step via the removed `StubAIProvider` default are updated to
  mock `getProvider`.
- `lib/__tests__/db.test.ts` [extend] — AC-3.
- `e2e/sync.spec.ts` [extend] — AC-12, AC-13, AC-14, AC-16.

- `lib/__tests__/anthropicExtract.test.ts` and `lib/__tests__/openaiExtract.test.ts` [extend] —
  update existing assertions to verify validated events and response usage under the new
  `runExtraction` result contract. Preserve existing coverage.

- `e2e-integration/anthropic-live.spec.ts` and `e2e-integration/openai-live.spec.ts` [extend] —
  adapt callers to the `{ events, usage }` result and verify returned usage agrees with the billing
  log. Approved by the owner during review of PR #101.

**docs**
- `docs/ARCHITECTURE.md` — §2 (`lib/orchestrator/ai.ts` row: mention `runEntryExtraction`, and
  that `runExtraction` now returns usage with the events; `lib/ai/provider.ts` row: drop the removed
  `StubAIProvider`; `app/` review route) and §4 (AI step now wired through to a saved
  `PendingExtraction`; the read-only review view).
- `docs/DECISIONS.md` — the D-entries drafted in §11.
- `docs/exec-plans/active/8d-5-extraction-wiring-and-read-only-cards.md` — this plan.

## 4. Acceptance criteria

| ID    | Observable behaviour | Level | Test file and name |
| ----- | -------------------- | ----- | ------------------ |
| AC-1  | Syncing one text entry with full config and a fake provider returning N events stores exactly one `PendingExtraction` for that entry whose `events` has length N, every `EventReview.status === 'pending'`. | unit | `sync.test.ts` — "saves one PendingExtraction with one pending review per event" |
| AC-2  | For the saved reviews, `resolvedCropTypeId` equals the roster crop matched by name and `resolvedLinkedProblemId` equals the open problem matched via the call's label map; neither is read from `extracted.matchedRosterName`/`linkedProblemRef` raw. A misspelled `matchedRosterName` stores `resolvedCropTypeId: null`. | unit | `sync.test.ts` — "stored reviews carry resolved IDs from roster and problems" |
| AC-3  | `savePendingExtraction` returns the written record, and `getPendingExtractionByEntryId` reads it back equal. | unit | `db.test.ts` — "savePendingExtraction returns and persists the record" |
| AC-4  | `PendingExtraction.usage.inputTokens`/`outputTokens` equal the token counts the provider returned for that call (the same values written to the entry's `ApiUsageLog`). | unit | `sync.test.ts` — "PendingExtraction.usage sourced from the provider response" |
| AC-5  | A provider that throws before any response leaves no `PendingExtraction`, no `ApiUsageLog`, the entry still in `getUnsyncedEntries`, and reports `ai: 'failed'`. | unit | `sync.test.ts` — "transport failure saves nothing and leaves entry unsynced" |
| AC-6  | A provider that returns usage but malformed events writes exactly one `ApiUsageLog`, saves no `PendingExtraction`, leaves the entry unsynced, and reports `ai: 'failed'`. | unit | `sync.test.ts` — "billed-but-invalid logs one usage and saves no extraction" |
| AC-7  | After a failed extraction, a second `runSync` (fake provider now returning valid events) calls the provider again and saves one `PendingExtraction`. | unit | `sync.test.ts` — "next sync retries after a failed extraction" |
| AC-8  | With a `PendingExtraction` already stored for the entry, `runSync` does not call the provider and writes no new `ApiUsageLog`; the `ApiUsageLog` count is unchanged. | unit | `sync.test.ts` — "existing PendingExtraction skips AI with no new usage log" |
| AC-9  | An entry whose extraction fails still has `weatherC` written when location is set. | unit | `sync.test.ts` — "weather is written even when extraction fails" |
| AC-10 | Calling `runSync` again while a prior `runSync` for the same entry is still in flight starts no second extraction: the provider's `extract` is called once and exactly one `PendingExtraction` exists. | unit | `sync.test.ts` — "in-flight guard prevents a second extraction for the entry" |
| AC-11 | One successful extraction of one entry with reported usage writes exactly one `ApiUsageLog`. | unit | `sync.test.ts` — "one usage log per successful extraction" |
| AC-12 | Seeding a `PendingExtraction` whose review has `resolvedCropTypeId` → crop "Tomato" while `extracted.matchedRosterName` is a different string, then opening the review view, shows a read-only card displaying "Tomato" (from the stored ID), an event-type badge, the notes text, and the linked problem reference as plain text; the entry text is visible and not editable. | e2e | `sync.spec.ts` — "review view shows read-only cards resolved from stored IDs" |
| AC-13 | Opening the review view for an entry with a stored `PendingExtraction` issues no request to the AI provider host and leaves the `ApiUsageLog` and `PendingExtraction` counts unchanged. | e2e | `sync.spec.ts` — "reopening review makes no API call or new usage record" |
| AC-14 | A SyncSheet row for an entry that has a stored `PendingExtraction` shows a "Review →" link that navigates to the review view for that entry. | e2e | `sync.spec.ts` — "row with pending extraction links to the review view" |
| AC-15 | On the installed PWA, a direct browser-origin request to `https://api.openai.com/v1/chat/completions` with a real key succeeds without a CORS error (closes Q-2 from 8d-3b, issue #93). | manual | On-device check; listed pending in the PR |
| AC-16 | Open the review URL directly for an existing entry without a `PendingExtraction` and for an ID with no entry. Both show “No extraction to review” and a “Back to Journal” link that navigates to `/journal`. Neither shows entry text or review cards. Loading the empty state makes no external request and leaves the stored records unchanged. | e2e | `sync.spec.ts` — "missing review data shows the empty state and links to Journal" |
| AC-17 | Valid events without provider usage save a pending review with `usage: null`, write no usage log, and report extraction success. | unit | `sync.test.ts` — "valid events without usage save a review without a usage log" |

## 5. Invariant check (ARCHITECTURE §9)

| Invariant | Touched | How it is held | Test or check |
| --------- | ------- | -------------- | ------------- |
| 1. Dependencies run one way: `app/` → `components/` → `lib/`. `lib/` never imports from `components/` or `app/`, and `components/` never imports from `app/`. | yes | The new review route lives in `app/`: `app/(tabs)/journal/sync/page.tsx` and `SyncReview.tsx` import only from `lib/` (db, roster/problem lookups) and from `components/` for shared UI; they are imported by nothing. `runEntryExtraction`/`runExtraction` in `lib/orchestrator/ai.ts` and the `lib/sync.ts` changes import only within `lib/`. No `lib/` or `components/` module gains an import from `app/`, so the one-way flow is preserved. | Review the changed imports for violations of invariant 1. Run `next build` to verify the review route exports successfully. |
| 2. Only `lib/db.ts` touches IndexedDB. | yes | `runEntryExtraction` and `SyncReview` read/write only through `lib/db.ts` functions. | Code review; existing tests pass. |
| 3. Network-facing modules (`lib/weatherSync.ts`, `lib/orchestrator/geocode.ts`, AI providers) never touch the database. The sync orchestrator reads and writes; they only fetch. | yes | Providers unchanged. `runExtraction`/`runEntryExtraction` (orchestrator) do the DB writes; the provider (from `getProvider`) only fetches. | AC-4, AC-6 (usage log written by orchestrator, not provider). |
| 11. Every create, update, and delete function in `lib/db.ts` returns the affected record (D-036). | yes | `savePendingExtraction` returns the written record. | AC-3. |
| 13. Weather and AI calls happen only in the sync orchestrator, started by the user, never at save. | yes | The AI call runs only inside `runSync`. The review view makes no network call. | AC-13 (no request from the review view). |
| 14. Nothing reaches `cropEvents`, `generalNotes`, or `CropType.lessons` until the user confirms that card. | yes | 8d-5 writes only a `PendingExtraction`; the cards are display-only, no Confirm. | AC-1 (only `pendingExtractions` written); no commit path exists. |
| 15. The model never sees database IDs. `matchedRosterName` is a name and `linkedProblemRef` is an ephemeral label; app code resolves both after parsing. | yes | The builder receives roster names and ephemeral labels; resolution to IDs is done by `resolveExtractedEvents`; the review view displays resolved names from stored IDs. | AC-2, AC-12. |
| 16. User-written text in the extraction prompt (entry text, `nextSeasonNote`, crop names, problem excerpts) is wrapped in explicit data tags. | yes | `buildExtractionRequest` (8d-2) does this unchanged; 8d-5 only calls it. | Covered by 8d-2 tests; unchanged. |
| 17. `ExtractedEventSchema` is the single source for extraction types. Derive the tool schema and the TypeScript type from it; never write a second one. | yes | No new event type/schema; `runExtraction` validates with `z.array(ExtractedEventSchema)`. | Existing extraction tests; no second schema added. |
| 18. Provider and model are Settings values. No provider name or model ID appears in source code. | yes | `runExtraction` reads `settings.aiProvider`/`aiModel` and resolves the provider via `getProvider`; tests mock `getProvider`, so no provider/model literal is added to source. | AC-1 run with Settings-driven config; providerConfig scan test unchanged. |
| 19. No automatic AI retries. | yes | A failure reports `failed` and stops; no code re-calls the provider. 8f-1 adds a manual Retry. | AC-5, AC-6 (single failure, no retry). |
| 8. `needsSync` is `1` or absent, never `0`/`false`. | no | Not changed; `applyNeedsSyncRule`/`writeEntryWeather` unchanged. A failed extraction leaves `needsSync` as it was. | AC-5 (entry stays unsynced). |

Adds a field derived from another field: no.

## 6. Dependencies and stop-and-ask triggers

- New packages: none.
- lib/db.ts schema or store changes: none. `savePendingExtraction` uses the existing
  `pendingExtractions` store. The human approved nullable `PendingExtraction.usage`. No store, index, or version change.
  No DB wipe required.
- Service worker, manifest, or base path changes: none.
- AI provider behaviour or extraction spec changes: none. `AnthropicProvider`, `OpenAIProvider`,
  and `ExtractedEventSchema` are unchanged. Changing `runExtraction`'s return type to include usage
  (§7 D-1) is an orchestrator-internal change, not a provider-behaviour or spec change, and no
  provider parameter is added (§7 D-2).
- Build plan edits: none.

## 7. Decisions needed before approval

None. The four decisions raised here (D-1 through D-4) were resolved in human review on
2026-11-20 and are recorded in §11; §1–8 have been updated to match.

## 8. Open questions

None.

## 9. Progress

**Plan-writers and plan-reviewers must not pre-fill or edit this section.**

- [x] 2026-11-24 21:38 UTC — Added acceptance tests and observed expected unit failures
  before wiring the orchestrator and persistence. Full Vitest run passed, 162 tests.
- [x] 2026-11-24 (resumed) — Confirmed browser baseline: 4 expected failures (AC-12, AC-13,
  AC-14, AC-16) for the missing review route and outdated SyncSheet link. Implemented
  `app/(tabs)/journal/sync/page.tsx`, `app/(tabs)/journal/sync/SyncReview.tsx`, and
  fixed the SyncSheet href from `/journal/sync/${id}/` to `/journal/sync?id=${id}`.
  Updated `e2e-integration/` live tests to destructure `{ events, usage }` from
  `runExtraction` (same return-type contract as the unit tests). All 162 unit tests,
  all 8 review e2e tests, lint, typecheck, and build pass. Only pre-existing webkit
  navigation timeout remains (unrelated to this phase).
- [x] PR #101 contrast fix — Reproduced the badge contrast at 3.12:1 in light mode and
  the entry text, crop name, and notes at 1.07:1 in dark mode on a clean seeded DB.
  After the fix, all six review tests passed in desktop Chromium and both contrast tests
  passed with iPhone 15 emulation in Chromium. The local sandbox blocked standard
  Chromium and WebKit launches. Desktop and installed-PWA readability rechecks are pending.

## 10. Surprises & discoveries

- Resolved (2026-11-24) — The human approved both provider extraction test updates in §3
  and the revised plan records approval.
- Resolved (2026-11-24) — The implementer found the persistence contract conflict. During
  follow-up discussion, the human identified a developer observability gap: usage could go
  missing repeatedly without maintainers knowing. See D-6 and issue #100.
- Resolved (2026-11-24 resumed) — Browser tests ran successfully in the resumed environment.
  Captured the 4 expected failures (AC-12, AC-13, AC-14, AC-16) against the baseline, then
  implemented the review UI and confirmed all 8 review tests pass.

## 11. Decision log

Planned durable D-entries (to be added to `docs/DECISIONS.md` in this PR; numbers assigned at
implementation, not renumbering existing entries). Each is recorded here in draft:

- 2026-11-20: **`runExtraction` returns usage alongside the validated events, and
  `PendingExtraction.usage` is taken from that return** (resolves §7 D-1, option b; human review).
  Reason: the usage then comes from the same provider response as the events, avoiding an
  `ApiUsageLog` IndexedDB read on each success; `runExtraction` still writes the billing log before
  validation (D-067, D-106). Alternatives: reading the latest `ApiUsageLog` by entry (the original
  recommendation, option a); storing zeros. Durable — changes the `runExtraction` return contract
  that `runEntryExtraction` consumes.

- 2026-11-20: **Sync tests mock `getProvider`; no provider-override parameter is added to
  `runExtraction` or `runEntryExtraction`** (resolves §7 D-2, option c; human review). Reason: no
  current caller passes the existing `SyncOptions.aiProvider` override, so mocking `getProvider`
  keeps the production sync wiring (`getProvider`) under test without widening a function
  signature; the `StubAIProvider` default and the now-dead `aiProvider` option are removed from
  `lib/sync.ts`/`SyncOptions`. Alternatives: adding an optional `provider?: AIProvider` to
  `runExtraction` (the original recommendation, option a); stubbing `fetch`. Durable — fixes the
  provider-selection seam (`getProvider`) that 8f-1/8f-2 also exercise.

- 2026-11-20: **`runEntryExtraction()` in `lib/orchestrator/ai.ts` is the per-entry extraction
  seam** (build request → `runExtraction` → source usage → resolve → `savePendingExtraction`),
  called by `lib/sync.ts` (resolves §7 D-4). Reason: separates gating/progress (sync) from
  extraction wiring (orchestrator); a single reuse point for 8f-1 Retry and 8f-2 Re-run.
  Alternatives: inline in `lib/sync.ts`. Durable — cross-phase interface.

- 2026-11-20: **The Sync review view uses the query-param route `/journal/sync?id=<entryId>`**,
  and the SyncSheet "Review →" link is changed to match (resolves §7 D-3). Reason: dynamic path
  segments cannot be enumerated under `next export`; query-param routing is the established,
  tested pattern (`EntryDetail`). Alternatives: a `[entryId]` segment with `generateStaticParams`.

- 2026-11-20: **D-5: Empty extraction review** → Show “No extraction to review” and a
  “Back to Journal” link to `/journal` when the entry or its stored `PendingExtraction`
  is missing. The empty state omits entry text and cards, makes no network calls, and writes
  no records. Reason: The entry text already has a home in the Journal’s entry detail view,
  and the link provides a way back from a directly opened review URL. Alternatives considered:
  keeping the entry text above the empty state when available, or redirecting immediately to
  Journal. [Ratified decision in issue #99](https://github.com/apoorva89/garden-journal/issues/99#issuecomment-7053836636)

- 2026-11-24: The human approved adding the two provider extraction tests to §3 to
  verify the new return contract while preserving existing coverage.

- 2026-11-24: **D-6: Preserve valid extractions when usage is absent.** Save the review with
  `usage: null` and skip the usage log for that response. Continue logging valid counts before
  event validation and keep existing error handling for failed calls and invalid events.
  The human raised the developer observability gap and approved resuming implementation.
  Track diagnostics and the proposed synthetic check in [issue #100](https://github.com/apoorva89/garden-journal/issues/100).
  Keep that follow-up and user-facing usage warnings outside this phase. Alternatives considered:
  storing zero counts, failing sync, and warning the user.
- 2026-11-24: For orphaned open problems whose instance or crop type cannot be found,
  use “General” as the prompt crop name. This keeps the problem eligible for label
  resolution without sending internal IDs. Alternatives considered were omitting the problem
  or using its stored instance ID as display text.

- PR #101 human review approved the existing changes to `e2e-integration/anthropic-live.spec.ts`
  and `e2e-integration/openai-live.spec.ts`, including assertions for returned usage and
  agreement with the billing log. The fix workflow preserves the approved §3 text.
- PR #101 human review approved fetching linked problem notes directly by stored
  `resolvedLinkedProblemId`. Extraction restricts candidates to open problems in the
  entry year, and review preserves the link if the problem's status later changes.
- The manual linked-problem check is deferred until Confirm/Done can write confirmed problems
  through the UI. A seeded Playwright test covers rendering stored links in this phase.
- Per-acceptance-criterion TDD evidence and a test-writing and review gate are planned for the
  next phase. The existing TDD evidence is retained for this PR.
- The human accepted the reported CI result for the existing WebKit coverage. The WebKit
  investigation is tracked in issue #102.

## 12. Outcomes & retrospective

(Filled in at completion by the retro-writer.)
