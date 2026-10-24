# Build plan

Garden Journal is built in small phases. Each phase can be delivered and verified on its own. This document defines the phases and the order they are built in.

Related documents:

- `DECISIONS.md` records what was decided and why. Phases cite it by ID.
- `ARCHITECTURE.md` is the code map. `ARCHITECTURE.md` §9 lists the invariants every phase must hold.
- `AGENTS.md` sets the workflow an agent follows for each phase.
- `exec-plans/` holds the execution plan for each phase, written from `exec-plans/TEMPLATE.md`.
- `ROADMAP.md` holds the rationale for the order and the deferred items.

## How to use this document

- Phase IDs are stable. An exec plan names the phase it implements by ID.
- Every phase and sub-phase gets its own exec plan before any code is written (`AGENTS.md`).
- Each phase lists a **Done when** list: three to six observable outcomes. The exec plan turns these into the acceptance criteria table in `exec-plans/TEMPLATE.md` §4, adding the test level, test file and test name. The exec plan may add criteria. It may not drop one without an approved change to this document.
- Test levels follow `DECISIONS.md` D-080 and `ARCHITECTURE.md` §8. On-device checks run in the installed home-screen app only (`DECISIONS.md` D-079).
- A phase that changes the `lib/db.ts` schema needs a database wipe before it runs (`DECISIONS.md` D-034).
- A phase covers only what it lists. Items under **Out of scope** belong to a later phase or to the open to-dos.
- There is no Phase 8a. Phase 8 starts at 8b.

Status values: Done, Next, Not started, Needs design, Deferred.

## Sequence

Phases that are Done are listed first. Order numbers apply to phases not yet built.

| Order | Phase | Name | Depends on | Status |
| --- | --- | --- | --- | --- |
| — | 1 | Scaffold and deploy | — | Done |
| — | 2 | IndexedDB data layer | 1 | Done |
| — | 3 | Journal tab | 2 | Done |
| — | 4 | New Entry screen | 2 | Done |
| — | 4b | Date pill on New Entry | 4 | Done |
| — | 4c | Missing-instance nudge in the tag sheet | 4, 6 | Done |
| — | 5 | Crops tab | 2 | Done |
| — | 6 | New Crop screen | 2 | Done |
| — | 7 | Crop Type screen | 5, 6 | Done |
| — | 7a | Database wipe | 7 | Done |
| — | 7b | Mutation return-value audit | 7a | Done |
| — | 7c | Settings screen | 7b | Done |
| — | 7c addendum | Location capture | 7c | Done |
| — | 8b | Sync & Verify data model | 7c | Done |
| — | 8c | Sync & Verify weather sync | 8b | Done |
| 1 | 8d-1 | Sync orchestrator and SyncSheet | 8c | Next |
| 2 | 8d-2 | Extraction request builder | 8b | Not started |
| 3 | schema-guard | Runtime startup schema check | — | Done |
| 4 | 8d-3 | Live extraction call | 8d-2 | Not started |
| 5 | 8d-4 | Extracted event resolution | 8b, 8d-2 | Not started |
| 6 | 8d-5 | Extraction wiring and read-only cards | 8d-1, 8d-3, 8d-4 | Not started |
| 7 | 8e-1 | Review outcomes and event photos schema | 8b | Not started |
| 8 | 8e-2 | Card states and Done gate | 8d-5 | Not started |
| 9 | 8e-3 | Instance resolution | 8e-2 | Not started |
| 10 | 8e-4 | Edit Event screen and Add missed event | 8e-2 | Not started |
| 11 | 8e-5 | Commit on Done | 8e-1, 8e-3, 8e-4 | Not started |
| 12 | 8e-6 | Photo tags and auto-attach | 8e-1, 8e-5 | Not started |
| 13 | 8f-1 | Manual Retry | 8d-5 | Not started |
| 14 | 10 | Next Season tab | 8e-5 | Not started |
| 15 | Eval set | AI evaluation set | 8d-3, 8e-5 | Needs design |
| 16 | 13 | Photo-only entries | 3, 4 | Not started |
| 17 | 12a | Entry edit rules and weather refresh | 3, 4, 8c, 8e-1 | Not started |
| 18 | 12b | Committed event dates | 12a, 8e-1, 8e-5 | Not started |
| 19 | 8f-2 | Re-run extraction | 8e-5 | Not started |
| 20 | 8f-3 | Staleness check | 8f-2, 12a | Not started |
| 21 | 9a | Crop Timeline: Timeline tab | 8e-5 | Not started |
| 22 | 9b | Crop Timeline: Issues tab | 9a | Not started |
| 23 | 11 | Care tab | 9a | Deferred |

---

## Completed phases

These phases are built. Their **Done when** lists were written after the fact from `DECISIONS.md` and the phase summaries in earlier plan versions. They describe shipped behaviour and have not been re-run against the current code.

### Phase 1: Scaffold and deploy

Next.js, TypeScript and Tailwind with the App Router and static export. Workbox service worker (`DECISIONS.md` D-076). `start_url` fixed at `/garden-journal/` (`DECISIONS.md` D-077). GitHub Pages deploy through CI (`DECISIONS.md` D-078).

Done when:

- The app installs to an iPhone home screen from Safari.
- The installed app opens and works offline after first load (`ARCHITECTURE.md` §6).
- CI runs the tests, then the build, then deploys; a failing test blocks the deploy.

### Phase 2: IndexedDB data layer

`lib/db.ts` with CRUD and query functions. Sparse `needsSync` index (`DECISIONS.md` D-022). `EntryPhoto` as its own store with a multiEntry index on crop tags (`DECISIONS.md` D-020). IDs, injectable `IDBFactory` and database singleton (`DECISIONS.md` D-023). `yearMonth` on entries (`DECISIONS.md` D-024).

Done when:

- Every query function in `lib/db.ts` has Vitest tests running against `fake-indexeddb` (`DECISIONS.md` D-080).
- `getUnsyncedEntries` returns only entries that have `needsSync` set.
- Photos can be found by crop type through the `by-cropTypeId` index.
- Entries can be fetched by `yearMonth`.

### Phase 3: Journal tab

Calendar strip, entry feed and photo strip variants.

Done when:

- The feed lists the stored entries for the selected month.
- The calendar strip and photo strip render from stored data.

### Phase 4: New Entry screen

Free-form text, photo attach with crop tagging, offline save. Photos are resized before storage (`DECISIONS.md` D-039). Untagged photos are allowed (`DECISIONS.md` D-046). "Notes for next season" is a collapsible field (`DECISIONS.md` D-047).

Done when:

- An entry saves to IndexedDB with no network, with `needsSync` set.
- Attached photos are resized and stored with their crop tags.
- A photo can be saved without tags.

### Phase 4b: Date pill on New Entry

Weekday and date shown as a prominent pill (`DECISIONS.md` D-044).

Done when:

- The pill shows the weekday and date of the entry being written.
- Tapping it opens the native date picker, and the chosen date is what is saved.

### Phase 4c: Missing-instance nudge in the tag sheet

Advisory nudge when a tagged crop has no instance for the entry's year (`DECISIONS.md` D-050). Shared `InstanceQuickCreate` component (`DECISIONS.md` D-051).

Done when:

- Tagging a crop with no instance for the entry's year shows the nudge with "Create now" and "Later".
- The nudge never blocks tagging or saving.
- "Create now" creates the instance through `InstanceQuickCreate`.

### Phase 5: Crops tab

Grid of crop type cards. Cover photo is the latest tagged photo, with a colour fallback.

Done when:

- Each crop type appears as a card.
- A card shows its latest tagged photo, or a fallback colour if it has none.

### Phase 6: New Crop screen

Crop type and first instance creation. Accepts `?cropTypeId` to skip crop type search (`DECISIONS.md` D-051).

Done when:

- A new crop type and its first instance are created from the screen.
- Opening the screen with `?cropTypeId` shows the instance form directly.

### Phase 7: Crop Type screen

Lessons list, yearly instance cards with year-matched cover photos (`DECISIONS.md` D-025), `addLessonToCropType` (`DECISIONS.md` D-033).

Done when:

- Lessons for the crop type are listed.
- Each yearly instance card shows a photo from that year, or a fallback.
- A lesson added through `addLessonToCropType` appears on the screen.

### Phase 7a: Database wipe

`resetDatabase()` and a trigger (`DECISIONS.md` D-081, `DECISIONS.md` D-034).

Done when:

- Confirming the wipe deletes all IndexedDB data and the app reloads to an empty state.

### Phase 7b: Mutation return-value audit

Every create, update and delete function returns the affected record (`DECISIONS.md` D-036).

Done when:

- Every create, update and delete function in `lib/db.ts` returns the affected record.
- Query functions are unchanged and the app builds with no type errors.

### Phase 7c: Settings screen

Settings is the fourth bottom tab (`DECISIONS.md` D-003). Fields and save-on-blur behaviour are in `DECISIONS.md` D-008. Provider and model are free-text (`DECISIONS.md` D-035). The wipe button is the first item (`DECISIONS.md` D-081).

Done when:

- Each field saves on blur and survives a reload.
- API keys are masked in the UI.
- The wipe button is first on the screen and asks for confirmation.

### Phase 7c addendum: Location capture

GPS on tap and a disambiguated search (`DECISIONS.md` D-054). Last frost date stays manual (`DECISIONS.md` D-009).

Done when:

- "Use current location" reads the position once, only when tapped, and stores latitude and longitude.
- Typing a place name shows results with region and country, and selecting one stores its coordinates.
- Leaving the field without selecting stores no coordinates and shows a note.

### Phase 8b: Sync & Verify data model

New fields and stores for Sync & Verify: `JournalEntry.updatedAt` (`DECISIONS.md` D-085), `CropEvent.year` and `resolved` (`DECISIONS.md` D-026, `DECISIONS.md` D-028), `ApiUsageLog` (`DECISIONS.md` D-031), `PendingExtraction` (`DECISIONS.md` D-086), `GeneralNote` (`DECISIONS.md` D-087). The extraction schema (`DECISIONS.md` D-092) and the `AIProvider` interface with a stubbed `extract()` (`DECISIONS.md` D-059). `getAllOpenProblems(year)`.

Done when:

- `ExtractedEventSchema` accepts well-formed fixtures and rejects malformed ones.
- `getAllOpenProblems` returns only unresolved problems for the target year.
- All tests pass and `lib/db.ts` and `lib/ai/` have no type errors.

### Phase 8c: Sync & Verify weather sync

Unsynced entry list and weather fetch from the stored coordinates (`DECISIONS.md` D-052). Sync starts only from a button (`DECISIONS.md` D-010). Weather is independent of AI (`DECISIONS.md` D-055). The entry point is described in `ARCHITECTURE.md` §4.

Done when:

- Syncing fetches and stores historical weather for each unsynced entry, and it shows on the Journal tab.
- Missing coordinates produce a message pointing to Settings.
- A failed weather fetch leaves that entry without weather and does not stop the sync.
- Weather sync does not call the AI provider.

---

## Phase 8d: AI extraction

Phase 8d turns an entry's text into reviewable events. It is split into five sub-phases. The review interface is Phase 8e.

### 8d-1: Sync orchestrator and SyncSheet

**Status:** Next. **Depends on:** 8c.
**Decisions:** `DECISIONS.md` D-010, D-052, D-055, D-066, D-090, D-097.
**Architecture:** `ARCHITECTURE.md` §3, §4, §9.

Scope: `lib/sync.ts` becomes the orchestrator for the Sync button, and SyncSheet shows what it did. The queue is the entries with `needsSync` set, oldest first, and entries are processed in that order. Each entry has two independent steps, each skipped when its condition is not met.

- Weather step: runs when the entry has no weather and coordinates are set.
- AI step: runs when the entry has text, no `extractionReviewedAt`, no `PendingExtraction`, and provider, model and key are all set. This phase builds the gate and the call site. The request, the call, resolution and saving the `PendingExtraction` are 8d-2 to 8d-5.
- A failed or skipped step never stops the other step or the run. Entries with no text have no AI step.
- `JournalEntry.extractionReviewedAt`: an optional timestamp with no index, so no schema version bump. 8e-5 writes it.
- `needsSync` clears when the entry has weather and either has no text or has `extractionReviewedAt` (`DECISIONS.md` D-097). One function in `lib/db.ts` applies this rule after any write to weather or `extractionReviewedAt`, so the order of the two does not matter.
- SyncSheet shows a banner naming what is missing (location, AI configuration, or both) and pointing to Settings. Each row shows a weather state and an AI state, and a "Review →" button when a `PendingExtraction` exists. After a run, a summary line reports weather and AI results separately. Failed states last for the session only. A reopened sheet rebuilds its rows from stored data.
- The in-flight guard is in the orchestrator, so closing the sheet cannot allow a second run. After a run, the sheet calls `onSynced()` so the Journal tab reloads.

Out of scope: the request builder, the call, resolution and saving a `PendingExtraction` (8d-2 to 8d-5), the Retry button (8f-1), the review screen (8d-5, 8e), writing `extractionReviewedAt` and the Done-side clearing (8e-5), a user-chosen sort order.

Done when:

- Syncing fetches weather only for entries without it and only when coordinates are set. The AI step is invoked only for entries with text, no `extractionReviewedAt`, no `PendingExtraction` and complete configuration, once per sync.
- A failed weather fetch, missing coordinates, incomplete AI configuration or a failed AI step does not stop the run, does not stop the other step for that entry, and leaves the entry unsynced.
- An entry with no text has `needsSync` cleared once it has weather, and keeps it without weather. A text entry keeps `needsSync` until it has weather and `extractionReviewedAt`, and clears it when the last of the two arrives, including through a weather fetch on an already reviewed entry.
- The banner names whichever of location and AI configuration is missing and points to Settings, and the steps that can still run do. Removing the key in Settings after a successful sync makes the next sync skip AI and show the banner.
- Rows are listed oldest first. Each shows weather and AI states separately, with no AI state for an entry with no text. "Review →" appears only when a `PendingExtraction` exists. After a run, a summary reports weather and AI results separately.
- Sync now is disabled during a run, including when the sheet is closed and reopened, and no second run starts. The Journal tab shows the new weather after the run.

### 8d-2: Extraction request builder


**Status:** Not started. **Depends on:** 8b.
**Decisions:** `DECISIONS.md` D-092, D-061, D-062, D-063, D-064, D-093, D-095.
**Architecture:** `ARCHITECTURE.md` §5, §9.

Scope: a pure function, `buildExtractionRequest()`, that takes the entry text, the entry's date, the entry's `nextSeasonNote`, the crop roster and the open problems for the entry's year, and returns the request to send. No network and no database access. This phase also extends `ExtractedEventSchema`.

- Roster as names only. Open problems as labels P1, P2 and so on, with crop name, date and a notes excerpt.
- All user-written content inside data tags, with a system instruction not to follow instructions inside them.
- `nextSeasonNote` included in the extraction input inside the same tags.
- The entry date included in the request, so relative dates resolve against it (`DECISIONS.md` D-093).
- The extraction rules in the system instruction.
- `ExtractedEventSchema` gains nullable `nurseryName` and `variety`, set only when the entry text states them and null otherwise (`DECISIONS.md` D-095). The 8b fixtures are updated to match.
- Tool schema derived from `ExtractedEventSchema`.

Out of scope: sending the request, parsing the response.

Done when:

- Given a fixture containing database IDs for crops and problems, the request contains none of them, and the roster appears as names only.
- Open problems appear with labels, and the label-to-problem mapping is available to the caller.
- Entry text, `nextSeasonNote`, crop names and problem excerpts each appear inside data tags, unmodified, including when the text contains instruction-like wording.
- The tool schema equals the one derived from `ExtractedEventSchema`, with no second schema, and the schema accepts a `nursery_pickup` event with or without `nurseryName` and `variety`.
- The system instruction states the extraction rules from `DECISIONS.md` D-093, and the request contains the entry date that relative dates resolve against.

### 8d-3: Live extraction call

**Status:** Not started. **Depends on:** 8d-2.
**Decisions:** `DECISIONS.md` D-058, D-059, D-092, D-067, D-068, D-035.
**Architecture:** `ARCHITECTURE.md` §4, §5, §9.

Scope: the real `AIProvider.extract()`, using the provider, model and key from Settings. Send the request from 8d-2, validate the response with `ExtractedEventSchema`, and log usage.

- Usage is logged as soon as a response with usage data arrives, before validation.
- A failure at any point persists nothing except that usage record.
- No automatic retries.

Out of scope: resolving names to IDs (8d-4), saving a `PendingExtraction` (8d-5).

Done when (tests stub the network):

- A well-formed response returns validated events.
- A response with usage data but malformed content logs one `ApiUsageLog` record, including `rawUsage`, and throws a validation error.
- A network failure before any response logs nothing and returns an error.
- When the provider fails, `extract()` sends exactly one request.
- The request uses the provider, model and key from Settings.
- On the installed app, one real call with a real key against a sample entry returns events and produces one usage record.

### 8d-4: Extracted event resolution

**Status:** Not started. **Depends on:** 8b, 8d-2.
**Decisions:** `DECISIONS.md` D-086, D-062, D-063, D-093.
**Architecture:** `ARCHITECTURE.md` §5, §9.

Scope: a pure function, `resolveExtractedEvents()`, that takes validated events, the roster, the label mapping from 8d-2 and the entry, and returns one `EventReview` per event, all with status `pending`.

- `matchedRosterName` resolves to a crop type ID by an exact trimmed, lowercase comparison. No fuzzy matching.
- `linkedProblemRef` resolves to a problem ID through the call's label mapping. The label is then discarded.
- An `eventDate` that is null or outside a sane bound falls back to the entry's date.
- `resolvedInstanceId` is not set here (8e-3).

Out of scope: persisting the reviews (8d-5).

Done when:

- A name matches regardless of case and surrounding whitespace. A null name, or a misspelled one, resolves to no crop.
- Events of type `general` skip crop resolution.
- A known label resolves to the matching problem ID, and an unknown label resolves to none. No label appears in the output.
- A null or out-of-bound date falls back to the entry date. The bound is stated in the exec plan and tested at both edges.
- Every returned `EventReview` has status `pending`, and its `extracted` field holds the validated AI event unmodified.
- Every ID in the output comes from the supplied roster and problems, never from the model response.

### 8d-5: Extraction wiring and read-only cards

**Status:** Not started. **Depends on:** 8d-1, 8d-3, 8d-4.
**Decisions:** `DECISIONS.md` D-086, D-055, D-067, D-072.
**Architecture:** `ARCHITECTURE.md` §3, §4.

Scope: connect the request builder, call and resolution to the AI step of the sync orchestrator (8d-1), and save the result as a `PendingExtraction`. Tapping "Review →" on a SyncSheet row opens a review view with the entry text and read-only cards.

- The entry text is read-only and always visible.
- Each card shows the crop name or "General", an event type badge, the notes, and the linked problem reference as plain text.
- A basic in-flight guard: while a call is outstanding, the same entry cannot start a second call.
- A failed call saves no `PendingExtraction` and shows as failed on the entry's SyncSheet row (8d-1).

Out of scope: Confirm, Edit, Dismiss, Done, the manual Retry button (8f-1), re-run and staleness handling (8f-2, 8f-3).

Done when:

- Syncing an entry with text and complete configuration runs one extraction, saves one `PendingExtraction` with one pending `EventReview` per event, and its row shows "Review →", which opens read-only cards with the extracted data. The crop name and linked problem on each card are looked up from the stored resolved IDs, not taken from the model's response.
- Opening that entry's review again shows the saved review with no new API call and no new usage record.
- While a call for an entry is outstanding, no second call starts for it.
- A failed call saves no `PendingExtraction`, leaves the entry unsynced, and shows as failed on its row. The next Sync now makes a new attempt.
- Each billed call produces exactly one `ApiUsageLog` record.
- Weather is written for the entry whether or not extraction succeeds.

---

## Phase 8e: Verification

Phase 8e is the interactive review loop. It is split into six sub-phases.

### 8e-1: Review outcomes and event photos schema

**Status:** Not started. **Depends on:** 8b.
**Decisions:** `DECISIONS.md` D-041, D-074, D-034, D-017, D-086.
**Architecture:** `ARCHITECTURE.md` §3, §9.

Scope: the schema changes later sub-phases need, in one version bump so the database is wiped once. This phase changes the `lib/db.ts` schema and requires a database wipe (`DECISIONS.md` D-034).

- A store recording the outcome of each reviewed event: confirmed as-is, confirmed after editing, dismissed, or added manually. Each record holds a snapshot of the card's `extracted` event (null for a manually added event) and its `edits`. The fields are settled in the exec plan.
- A way for a `CropEvent` to reference its attached photos.
- `CropEvent.entryId`, with a single-field index, so the events committed from an entry can be found.
- A field on `PendingExtraction` recording that the user kept an extraction after the entry was edited (8f-3).

Out of scope: writing outcomes and `entryId` (8e-5), attaching photos (8e-6), using the acknowledgement field (8f-3).

Done when:

- After a wipe, the database opens with the new store and fields.
- An outcome record can be created and read back, carrying its outcome value, entry reference, extracted snapshot (which may be null) and edits.
- A `CropEvent` can be written with photo references and an `entryId`, read back with them, and listed by `entryId`.
- A `PendingExtraction` can record the keep acknowledgement and return it.
- Any new index is single-field.
- Existing tests pass.

### 8e-2: Card states and Done gate


**Status:** Not started. **Depends on:** 8d-5.
**Decisions:** `DECISIONS.md` D-094, D-064, D-086.
**Architecture:** `ARCHITECTURE.md` §4, §9.

Scope: Confirm, Dismiss and undo on each card, persisted in the `PendingExtraction`. Confirm is enabled for `general` events, for `lesson` events with no resolved crop, and for events whose crop is resolved. The instance condition is added in 8e-3.

Out of scope: committing anything to crop timelines (8e-5), the Edit screen (8e-4).

Done when:

- Each card shows pending, confirmed or dismissed, and the status survives closing and reopening the app.
- Confirm is enabled for a `general` event, a `lesson` event with no resolved crop, or an event with a resolved crop, and disabled otherwise.
- Tapping a confirmed or dismissed card's action again returns it to pending.
- Dismiss is available on every card regardless of resolution.
- The Done button is disabled while any card is pending and enabled once every card is confirmed or dismissed.
- Confirming or dismissing writes nothing to `cropEvents`, `generalNotes` or `CropType.lessons`.

### 8e-3: Instance resolution


**Status:** Not started. **Depends on:** 8e-2.
**Decisions:** `DECISIONS.md` D-095, D-051, D-050.
**Architecture:** `ARCHITECTURE.md` §9.

Scope: for a card with a resolved crop whose event is not a `lesson`, look up the crop's instance for the entry's year. If none exists, show a blocking notice and disable Confirm until the user creates one through `InstanceQuickCreate`. For Nursery Pickup events, prefill nursery name and variety from `nurseryName` and `variety` in `extracted`, where the extraction supplied them. The prefill applies only when an instance is created. An existing instance is never changed from those values. `lesson` events are written to `CropType.lessons`, which has no instance, so they skip this check.

Done when:

- A card whose crop has an instance for the entry's year sets `resolvedInstanceId` and shows no notice.
- A card whose crop has no instance for that year shows the blocking notice and a disabled Confirm.
- Tapping the notice opens `InstanceQuickCreate` prefilled with the crop and the entry's year. For a Nursery Pickup event it is also prefilled with the nursery name and variety from the extraction.
- After the instance is created, one instance exists for that crop and year, the notice is gone, `resolvedInstanceId` is set and Confirm is enabled.
- `general` and `lesson` events skip the check. A `lesson` card with a resolved crop has Confirm enabled without an instance.

### 8e-4: Edit Event screen and Add missed event

**Status:** Not started. **Depends on:** 8e-2.
**Decisions:** `DECISIONS.md` D-094, D-051, D-033.
**Architecture:** `ARCHITECTURE.md` §9.

Scope: the Edit Event screen and a manual way to add an event the AI missed.

- Searchable crop picker with the ability to create a new crop inline.
- Event type picker and editable notes, pre-filled from the extraction.
- Problem linkage, shown only for Fix events. Lesson filing, shown only for Lesson events.
- Edits are stored beside the extraction and never overwrite it, so a confirmed-as-is event can be told apart from a confirmed-after-edit one (`DECISIONS.md` D-041). Saving returns the card to pending.
- `EventReview.extracted` becomes nullable. A manually added card has `extracted` null, and its values come from `edits`, which must hold at least an event type and notes. A card's values are `extracted` overlaid with `edits`.
- "Add missed event" adds a pending card with nothing pre-filled and opens the same screen. Leaving the screen without saving removes the new card. A manually added event takes the entry date, because the screen has no date field.

Done when:

- Opening Edit on a card shows the extracted values. Saving stores the changes in `edits`, leaves `extracted` unchanged, and returns the card to pending even if it was confirmed.
- Choosing a crop in the picker sets `resolvedCropTypeId`. Creating a new crop inline returns to the screen with that crop selected.
- The problem linkage control appears only for Fix events, and lists the open problems for the entry's year.
- The lesson filing control appears only for Lesson events.
- "Add missed event" adds one pending card with `extracted` null and opens the Edit screen. Its values come from `edits`. Leaving the screen without saving removes the card.
- Confirm is disabled on a manually added card until event type and notes are set. After that it can be confirmed like any other card.

### 8e-5: Commit on Done


**Status:** Not started. **Depends on:** 8e-1, 8e-3, 8e-4.
**Decisions:** `DECISIONS.md` D-094, D-071, D-041, D-097, D-026, D-028, D-087, D-033, D-086.
**Architecture:** `ARCHITECTURE.md` §3, §9.

Scope: tapping Done commits every confirmed card.

- Standard events write a `CropEvent` with `entryId` and a `year` derived from its date. Problem events start with `resolved: false`. A manually added event takes the entry date.
- `general` events write a `GeneralNote` linked to the entry, without `isLesson`. No screen shows it (`DECISIONS.md` D-015).
- `lesson` events with no resolved crop write a `GeneralNote` with `isLesson: true`.
- `lesson` events with a resolved crop are written through `addLessonToCropType`.
- A confirmed Fix linked to a problem shows a "Mark resolved" checkbox, unchecked by default. If checked, the linked problem's `resolved` is set to true.
- An outcome record is written for every card, with a snapshot of its extracted event and edits.
- `extractionReviewedAt` is set on the entry, `needsSync` is cleared if the entry has weather (`DECISIONS.md` D-097), and its `PendingExtraction` is deleted.
- The commit is one transaction: all or nothing. The exec plan decides how `addLessonToCropType` takes part in it.

Out of scope: attaching photos (8e-6).

Done when:

- Done writes one `CropEvent` per confirmed standard card, using the edited values where the card was edited, with the card's instance, the entry's `entryId`, `year` from the event date (the entry date for a manually added event) and `resolved: false` for problems. Dismissed cards write nothing.
- A `general` card writes a `GeneralNote` without `isLesson`. A `lesson` card with no resolved crop writes one with `isLesson: true`. A `lesson` card with a resolved crop adds a lesson that appears on the Crop Type screen. A crop-less lesson appears on no crop's lesson list.
- A confirmed Fix linked to a problem leaves the problem open when the checkbox is unchecked, and sets `resolved: true` on it when checked.
- One outcome record exists per card, with the correct outcome value (as-is, after editing, dismissed or added manually) and a snapshot of its extracted event (null if added manually) and its edits.
- After Done, the entry has `extractionReviewedAt` set and no `PendingExtraction`, and reopening it makes no API call. It leaves the unsynced list if it has weather, and stays in the list until weather is filled if it has none.
- If any write in the commit fails, none of that commit's writes are saved.

### 8e-6: Photo tags and auto-attach

**Status:** Not started. **Depends on:** 8e-1, 8e-5.
**Decisions:** `DECISIONS.md` D-074, D-046.
**Architecture:** `ARCHITECTURE.md` §3.

Scope: a photo section in the review view, and photo attachment when events are committed.

- Each of the entry's photos is shown with its current tags, and tapping adjusts them, using the same tagging pattern as the tag sheet.
- On Done, each confirmed event gets every photo from the entry whose tags include the event's crop, using the tags as they stand at that moment.
- Each card has an option to change which photos are attached.

Done when:

- Changing a photo's tags in the review view updates that photo's crop tags and leaves the entry's `updatedAt` unchanged.
- After Done, a confirmed event references exactly the entry photos tagged with its crop at that moment. Photos tagged only with other crops, and untagged photos, are not attached.
- Changing tags before Done changes which photos are attached.
- Changing a card's photo selection stores that selection instead of the tag-based default.
- Events with no crop get no photos attached automatically.

---

## Phase 8f: Failure and re-run handling

Phase 8f is split into three sub-phases, built at different points in the sequence.

### 8f-1: Manual Retry

**Status:** Not started. **Depends on:** 8d-5.
**Decisions:** `DECISIONS.md` D-068, D-067.
**Architecture:** `ARCHITECTURE.md` §4, §8.

Scope: a Retry button on the entry's SyncSheet row after a failed extraction, using the in-flight guard from 8d-5. Retry runs only the AI step. The failed state lasts for the session only: after the sheet is closed the entry shows as waiting, and Sync now re-attempts it. No automatic retries.

Done when:

- After a failed extraction the entry's SyncSheet row shows a Retry button, and no second request is sent automatically.
- Tapping Retry sends exactly one new AI request and no weather request. On success, one `PendingExtraction` is saved.
- While a request is outstanding, Retry is disabled.
- A slow successful response followed by a second tap on Retry does not produce two `PendingExtraction` records or two requests.

### 8f-2: Re-run extraction

**Status:** Not started. **Depends on:** 8e-5.
**Decisions:** `DECISIONS.md` D-096, D-086.
**Architecture:** `ARCHITECTURE.md` §4.

Scope: a "Re-run extraction" action in the review view. It discards the existing `PendingExtraction`, including its review state, and runs extraction again. Done deletes the `PendingExtraction` (8e-5), so re-run is not offered for an entry that has been committed. Re-run never changes committed events.

Done when:

- The re-run action is available whenever the review view is open, and no re-run action is reachable for an entry already committed through Done.
- With at least one confirmed card or manually added card, a warning states how many confirmed selections and manually added cards will be lost. Cancelling leaves the review unchanged.
- Confirming the warning discards the existing `PendingExtraction` and produces a new one with all cards pending.
- With no confirmed and no manually added cards, re-run proceeds without a warning.
- Each re-run call produces one usage record.

### 8f-3: Staleness check

<!-- UNCONFIRMED U-25: how a date edit affects a pending review is open. This list covers text and `nextSeasonNote` edits only. -->

**Status:** Not started. **Depends on:** 8f-2, 12a.
**Decisions:** `DECISIONS.md` D-096, D-072, D-085, D-086.
**Architecture:** `ARCHITECTURE.md` §4.

Scope: when a review is reopened and the entry was edited after the extraction was created (the entry's `updatedAt` is later than the `PendingExtraction`'s `createdAt`), the review is stale. Its cards stay visible, Confirm and Done are disabled, and the user chooses Keep or Re-run. Keep records an acknowledgement on the `PendingExtraction` (8e-1) and makes no API call. Re-run behaves as in 8f-2, including the warning. `updatedAt` changes on edits to text, `nextSeasonNote` and date (12a), and not on photo or tag changes. Entry text stays read-only inside the review view.

Decision needed before the exec plan is approved: how a date edit affects a pending review. It is decided together with 12b.

Done when:

- Reopening a review after the entry's text was edited shows a notice offering Keep and Re-run, and Confirm and Done are disabled until one is chosen.
- The same applies after `nextSeasonNote` was edited.
- Keep makes no API call, re-enables Confirm and Done, and the notice does not return on reopening. A later edit makes the review stale again.
- Re-run from the notice behaves as in 8f-2, including the warning.
- Changing a photo's tags in the review view does not make the review stale.
- Reopening a review whose entry was not edited shows no notice.

---

## Phase 10: Next Season tab

**Status:** Not started. **Depends on:** 8e-5.
**Decisions:** `DECISIONS.md` D-014, D-015, D-033, D-087.
**Architecture:** `ARCHITECTURE.md` §1.

Scope: all lessons across all crop types in one scannable list. A "General" card sits at the top, listing `GeneralNote` records with `isLesson: true`, above the lessons grouped by crop type.

Out of scope: reminders (`DECISIONS.md` D-011). Display of general notes that are not lessons (`DECISIONS.md` D-015).

Done when:

- Lessons are listed grouped by crop type, from `CropType.lessons`.
- A "General" card appears first and lists the `GeneralNote` records with `isLesson: true`.
- `GeneralNote` records without `isLesson` do not appear.
- A lesson added on the Crop Type screen, or committed from a review in 8e-5, appears on this tab.
- A crop-less lesson committed in 8e-5 appears in the General card and on no crop's lesson list.

---

## AI evaluation set

**Status:** Needs design. **Depends on:** 8d-3, 8e-5.

Scope: the AI evaluation set. Metrics and method are in `AI_EVALUATION.md`. There is no Done when list until those are written.

---

## Phase 13: Photo-only entries

**Status:** Not started. **Depends on:** 3, 4.
**Decisions:** `DECISIONS.md` D-048, D-057.
**Architecture:** `ARCHITECTURE.md` §4.

Scope: the three behaviours in `DECISIONS.md` D-048. Saving a photo-only entry already works. How a photo-only entry is synced is in 8d-1.

Done when:

- A feed card for an entry with photos and no text shows no empty text block.
- Save is disabled, as a greyed button with no error, when an entry has neither text nor photos, and enabled when it has either. The same holds on the entry detail view, which edits text and photos.
- Entries on the same date sort by `createdAt`, newest first, after sorting by date, newest first.

---

## Phase 12: Entry detail and edit

Phase 12 is split into two sub-phases. The entry detail view already exists: tapping a saved entry in the feed opens it, and it edits the text, `nextSeasonNote`, date and photos. The all-entries feed stays read-only (`DECISIONS.md` D-049).

### 12a: Entry edit rules and weather refresh

<!-- UNCONFIRMED U-25: how a date edit affects a pending review and committed events. -->

**Status:** Not started. **Depends on:** 3, 4, 8c, 8e-1.
**Decisions:** `DECISIONS.md` D-049, D-090, D-024, D-025, D-085, D-045, D-097, D-087, D-074.
**Architecture:** `ARCHITECTURE.md` §3, §4, §9.

Scope: bring the detail view's edit path in line with `DECISIONS.md` D-049 and D-085. Its save path does not currently update `updatedAt`.

- `updatedAt` is updated by edits to the text, `nextSeasonNote` and date. Photo changes do not update it, because photos are not extraction input.
- A date edit stays within the entry's current year. It uses the existing `updateJournalEntryAndPhotoDates` cascade, extended to the entry's `GeneralNote` dates (`ARCHITECTURE.md` §3), and clears the entry's weather.
- A "Refresh weather" action on the detail view. The user starts it. It runs only the weather step for the entry's current date, makes no AI request, and clears `needsSync` only if the `DECISIONS.md` D-097 rule is then met. It never sets it.
- Edits never set `needsSync`, so an edited entry is never sent back through extraction.
- Removing a photo also removes its references from the entry's committed events.

Out of scope: editing committed event dates (12b), and handling of a pending review after an edit (8f-3).

Decision needed before the exec plan is approved: how a date edit affects a pending review.

Done when:

- Saving an edit to the text, `nextSeasonNote` or date sets `updatedAt` to a later value. Changing, adding or removing a photo leaves it unchanged.
- A date edit accepts only dates in the entry's current year. Saving it updates the entry's `date` and `yearMonth`, every photo's `entryDate` and the `date` of each of the entry's `GeneralNote`s in one transaction, and the entry appears under the new month on the Journal tab. If any write fails, nothing is changed.
- Saving a date edit clears the entry's weather. Saving an edit that leaves the date unchanged keeps it.
- "Refresh weather" fetches weather for the entry's current date from the stored coordinates, sends no AI request, and clears `needsSync` if the entry then has weather and either no text or `extractionReviewedAt`, otherwise leaves it as it was. With no coordinates it shows a message pointing to Settings. A failed fetch leaves the entry without weather.
- Saving an edit makes no network request and leaves `needsSync` as it was: set stays set, absent stays absent.
- Removing a photo removes its references from every committed event of the entry in the same transaction.

### 12b: Committed event dates

<!-- UNCONFIRMED U-25: whether the proposal is part of the date save, what Cancel does, and how it interacts with a pending review. The Done when list is provisional. -->

**Status:** Not started. **Depends on:** 12a, 8e-1, 8e-5.
**Decisions:** `DECISIONS.md` D-049, D-026.
**Architecture:** `ARCHITECTURE.md` §3.

Scope: when an entry's date is edited and the entry has committed events, the app proposes a new date for each event, moved by the same number of days as the entry date. The user confirms the proposal or sets each date themselves. This is the only way committed event dates change. An event's date cannot leave its current year, and its crop instance and `year` are not changed. Events are found through `CropEvent.entryId`.

Out of scope: editing or deleting committed events in any other way.

Done when:

- After a date edit on an entry with committed events, a proposal lists each event with its current and proposed date.
- A proposed date is the event's date moved by the same number of days as the entry date.
- Confirming writes the dates the user accepted or set. Each event keeps its crop instance and `year`.
- A date outside the event's current year cannot be chosen, and none is proposed.
- Only events committed from that entry are listed. An entry with no committed events shows no proposal.

---

## Phase 9: Crop Timeline

The Crop Timeline screen shows the full season for one crop instance, with three tabs (`DECISIONS.md` D-012). The Care tab is Phase 11.

### 9a: Timeline tab

**Status:** Not started. **Depends on:** 8e-5.
**Decisions:** `DECISIONS.md` D-012.
**Architecture:** `ARCHITECTURE.md` §3.

Scope: the screen and its Timeline tab, listing the instance's events from oldest to newest.

Out of scope: "Save as lesson" (`DECISIONS.md` D-018).

Done when:

- Opening a crop instance shows its events from oldest to newest.
- Events committed in 8e-5 for that instance appear.
- Events for other instances do not appear.

### 9b: Issues tab

**Status:** Not started. **Depends on:** 9a.
**Decisions:** `DECISIONS.md` D-012, D-028, D-071.
**Architecture:** `ARCHITECTURE.md` §3.

Scope: Problem and Fix events grouped into threads, unresolved problems first. Resolution status is the stored `resolved` flag, never computed from linked fixes. Each problem has a manual toggle to mark it resolved or reopen it.

Done when:

- Problem events and their linked Fix events appear as threads, with unresolved problems first.
- A problem's status reflects its stored `resolved` flag.
- Toggling a problem to resolved, or back to unresolved, updates the stored flag without any Fix being linked.
- A Fix dated before its Problem still appears in that Problem's thread.

---

## Phase 11: Care tab

**Status:** Deferred. **Depends on:** 9a.
**Decisions:** `DECISIONS.md` D-013, D-040, D-011.

The Care tab's purpose is undecided, so its scope and Done when list are not written (`DECISIONS.md` D-013). They are written when the phase is scheduled.

---

## Open to-dos

Items not yet assigned to a phase. Rationale for deferred items is in `ROADMAP.md`.

- **Service worker `skipWaiting`.** The worker does not call it, so a new deploy waits until every app window closes. Confirm whether this is intended. See `ARCHITECTURE.md` §6, `DECISIONS.md` D-076 and GitHub Issue #18.
- **`getOpenProblemsByType`.** Kept in the code and unused. Revisit when cleaning up the data layer. See `DECISIONS.md` D-027.
- **AI always configured.** Before the first release, make sure an AI provider, model and key are always set, so the unconfigured path is not a normal state. See `DECISIONS.md` D-097.
- **Export, backup and migration policy.** Decide before the first release. See `DECISIONS.md` D-017 and `DECISIONS.md` D-034.
- **Non-lesson `GeneralNote` display.** Deferred. See `DECISIONS.md` D-015.
- **Reminders.** Deferred. See `DECISIONS.md` D-011.
- **Care tab and `CareTask` schedule format.** Deferred. See `DECISIONS.md` D-013 and `DECISIONS.md` D-040.
- **Timeline "Save as lesson".** Out of scope for now. See `DECISIONS.md` D-018.
- **Editing or deleting committed events beyond their dates.** Not planned. Dates are covered by 12b.
- **Duplicate lessons.** `addLessonToCropType` does not dedupe. Out of scope for now. See `DECISIONS.md` D-033.
- **SyncSheet sort order.** The sheet lists unsynced entries oldest first. Later: let the user choose ascending or descending.
