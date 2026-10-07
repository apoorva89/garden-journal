# Decisions

This log records the product and technical decisions behind Garden Journal, including decisions that were later replaced. It is the project's design history: the build plan describes what is being built now, and this file explains why.

**How to read an entry**

- **ID** is stable and never renumbered. Superseded entries keep their ID and point to the entry that replaced them.
- **Type** is *Product* (scope, user-facing behavior) or *Technical* (how it's built).
- **Status** is one of: Current · Superseded by D-xxx · Deferred · Planned, not built · Out of scope for now.
- **Phase** is where the decision was made or first applied, or "Cross-cutting". "Screen spec" means the original screen specification that preceded the phased build plan.
- **Alternatives** lists only options that were actually considered at the time. "Not recorded" means none were written down.
- *(unverified)* marks an entry that describes built behavior but hasn't yet been checked against the code. Entries for behavior that isn't built yet, and superseded entries, don't carry the tag.

Entries written before this log existed have no dates. New entries include a **Date** field.

**Sections**

1. [Product scope](#product-scope)
2. [Data model](#data-model)
3. [Entry & crop UI](#entry--crop-ui)
4. [Sync & AI](#sync--ai)
5. [Infrastructure & testing](#infrastructure--testing)

---

## Product scope

### D-001 — Three bottom tabs: Journal, Crops, Next Season
**Type:** Product
**Status:** Superseded by D-003
**Phase:** Screen spec
**Context:** The original screen spec needed top-level navigation for a mobile-first app.
**Decision:** A bottom tab bar with three tabs: Journal, Crops, and Next Season. Settings had no tab.
**Why superseded:** Settings grew to hold AI provider configuration, API keys, location, and the database wipe control, and needed to be reachable from any screen.

### D-002 — Settings reached from a gear icon on the Journal header
**Type:** Product
**Status:** Superseded by D-003
**Phase:** 7c
**Context:** When the Settings screen was planned, the three-tab bar from D-001 was already in place.
**Decision:** Reach Settings through a gear icon in the Journal tab header, as a non-tab route, to avoid crowding the tab bar.
**Why superseded:** A gear icon on one screen makes Settings reachable only from that screen. A tab stays fixed at the bottom and is reachable from every screen.

### D-003 — Four bottom tabs: Journal, Crops, Next Season, Settings
**Type:** Product
**Status:** Current
**Phase:** 7c
**Context:** Settings needed a home once it held AI configuration and location (D-008).
**Decision:** The bottom tab bar has four tabs: Journal, Crops, Next Season, and Settings.
**Alternatives:** A gear icon on the Journal header (D-002).
**Consequences:** Settings is one tap away from any screen. The tab bar carries four items instead of three.

### D-004 — Core design principles
**Type:** Product
**Status:** Current
**Phase:** Screen spec
**Context:** The app needed a small set of principles to guide screen-level choices.
**Decision:** Five principles:
- **Photo-forward:** images are large and prominent throughout.
- **Offline-first:** every write goes to IndexedDB immediately, with no network dependency.
- **Free-form input:** no rigid forms; AI extracts the structure.
- **Verify before commit:** nothing reaches a crop timeline without the user's confirmation.
- **Crop roster as anchor:** the list of crops is used for photo tagging and as AI context.

**Alternatives:** Not recorded.
**Consequences:** Most later decisions trace back to one of these, especially offline-first (D-045, D-055) and verify before commit (D-064, D-069).

### D-005 — Single user, no auth, local-first
**Type:** Product
**Status:** Current
**Phase:** Cross-cutting
**Context:** The app is a personal garden journal used on one phone, and the first goal is a working MVP.
**Decision:** For the MVP: one user, no accounts or authentication, and all data stored locally on the device. Authentication may be added in a later phase.
**Alternatives:** Not recorded.
**Consequences:** No sign-in flow or server. Several simplifications depend on this, including no migrations (D-034) and an always-visible wipe button (D-081). Adding authentication later would likely need a server, which would reopen D-006.

### D-006 — No remote database
**Type:** Technical
**Status:** Current
**Phase:** Cross-cutting
**Context:** An earlier version of the project used Firebase.
**Decision:** No remote database. IndexedDB on the device is the only data store. Chosen for simplicity and because it costs nothing to run.
**Alternatives:** Firebase, which was used earlier and dropped because of reliability problems.
**Consequences:** Data can't be shared across devices. It exists only on one device, with no backup (D-017).

### D-007 — Settings holds location and last frost date only
**Type:** Product
**Status:** Superseded by D-008
**Phase:** Screen spec
**Context:** The original spec needed global configuration for weather lookups and reminder context.
**Decision:** Settings has two fields: a location, used for historical weather, and an optional last frost date, used as context when setting reminder dates.
**Why superseded:** Sync & Verify needs AI provider configuration and API keys, and the weather API needs coordinates rather than a place name (D-052). There was also no phase that built Settings at all, which blocked testing sync.

### D-008 — Expanded Settings fields
**Type:** Product
**Status:** Current
**Phase:** 7c
**Context:** Sync & Verify can't be tested without somewhere to enter AI configuration and a location.
**Decision:** Settings is a single record containing location name, latitude and longitude, optional last frost date, AI provider, AI model, and API keys per provider. Each field saves on blur; there is no Save button. The database wipe control also lives here (D-081).
**Alternatives:** A separate Save button, rejected to match the app's no-friction, save-immediately behavior elsewhere.
**Consequences:** Placement of the screen is covered by D-003. How location is captured is covered by D-054.

### D-009 — Last frost date is manual and optional
**Type:** Product
**Status:** Current
**Phase:** 7c addendum
**Context:** When location capture was improved (D-054), the last frost date field was reviewed alongside it.
**Decision:** Last frost date stays a plain, optional date input. It is never derived automatically.
**Alternatives:** Automatic derivation was explicitly excluded; the reasoning was not recorded.
**Consequences:** None beyond the field staying as it is.

### D-010 — Sync starts from a manual button
**Type:** Product
**Status:** Current
**Phase:** 8b
**Context:** The original spec had sync start either manually or automatically on wifi detection.
**Decision:** Sync starts only when the user taps a button.
**Alternatives:** Automatic trigger on wifi detection (screen spec).
**Consequences:** No network call happens without explicit user intent, which matches the retry policy (D-068).

### D-011 — Reminders through iOS Reminders deep links
**Type:** Product
**Status:** Deferred
**Phase:** Screen spec
**Context:** The original spec called for "Save as Reminder" on Crop Type lessons, "Set Reminder" on the Next Season tab, and recurring reminders on the Care tab, all through deep links into the iOS Reminders app.
**Decision:** All reminder UI is deferred until after the core loop is complete. When picked up, it will be designed in one pass across Next Season and Care. Recorded design notes:
- A `reminderSet` flag (or richer state) on `Lesson`, set optimistically when the deep link fires, with no check that the user saved the reminder.
- A shared `buildReminderDeepLink()` helper so each screen doesn't build its own URL.
- A decision on whether `CareTask` needs its own reminder state, since care reminders recur and lesson reminders are one-off.

**Alternatives:** Not recorded.
**Consequences:** The Crop Type screen was built without its reminder button.

### D-012 — Crop Timeline has three tabs: Timeline, Issues, Care
**Type:** Product
**Status:** Current
**Phase:** 9
**Context:** The Crop Timeline screen shows the full season for one crop instance. The original spec gave it three tabs. The first build plan described only Timeline and Issues, with Care as a separate later phase; the current plan restores Care as the third tab.
**Decision:** Three tabs:
- **Timeline:** all events, oldest to newest.
- **Issues:** Problem and Fix events grouped into threads, with unresolved problems first.
- **Care:** care tasks for this instance.

**Alternatives:** Not recorded.
**Consequences:** Not yet built. Care tab contents are deferred (D-013). Issues depends on the stored `resolved` flag (D-028).

### D-013 — Care tab purpose
**Type:** Product
**Status:** Deferred
**Phase:** 11
**Context:** Two different intents for the Care tab were recorded and never reconciled:
- **Informational:** editable cards per crop instance with name, free-text schedule, product, and dosage. No reminders, no calculation.
- **Care management:** tasks scheduled by interval or specific date, application history, a "Done, remind me again" action that computes the next due date, and reminder integration.

**Decision:** Deferred. The intent will be chosen when the Care tab is picked up.
**Alternatives:** The two intents above.
**Consequences:** The `CareTask` schedule format is deferred with it (D-040).

### D-014 — Next Season shows a "General" card for crop-less lessons
**Type:** Product
**Status:** Planned, not built
**Phase:** 10
**Context:** Some next-season thoughts don't name a crop. These are stored as `GeneralNote` records with `isLesson: true` (D-032).
**Decision:** The Next Season tab shows a "General" card at the top, listing `GeneralNote` lessons, above the lessons grouped by crop type.
**Alternatives:** Not recorded.
**Consequences:** This is required, not optional polish; it is the only reason the `isLesson` flag exists.

### D-015 — Display for non-lesson general notes
**Type:** Product
**Status:** Deferred
**Phase:** 10
**Context:** Garden-wide observations with no crop are stored as `GeneralNote` records without `isLesson` (D-032).
**Decision:** No screen displays them yet.
**Alternatives:** Not recorded.
**Consequences:** These notes are stored but not visible anywhere in the app until a display is designed.

### D-016 — Crop card cover photos seeded from the internet
**Type:** Product
**Status:** Superseded by D-020
**Phase:** 2
**Context:** Crops tab cards need a background photo, including for crops the user hasn't photographed yet.
**Decision (considered):** Seed each crop type's cover photo from an internet image source.
**Why superseded:** Moving photos into their own store with a tag index (D-020) made it cheap to use the user's own most recent tagged photo. Crops without a photo fall back to a solid color picked deterministically from the crop name.

### D-017 — No export or backup during build and testing
**Type:** Product
**Status:** Current
**Phase:** Cross-cutting
**Context:** Data lives only on one device (D-006), and schema changes wipe it (D-034).
**Decision:** No export or backup feature while the app is being built and tested. To be revisited before the first release, together with the migration policy.
**Alternatives:** Not recorded.
**Consequences:** Accepted: the developer's own journal entries are lost on each wipe.

### D-018 — "Save as lesson" from timeline events
**Type:** Product
**Status:** Out of scope for now
**Phase:** 9
**Context:** The original spec included a "Save as lesson" button on Observation, Problem, Fix, and Harvest events in the Crop Timeline.
**Decision:** Not built for now. Lessons come from AI extraction, the "Notes for next season" field, and manual entry on the Crop Type screen.
**Alternatives:** Not recorded.
**Consequences:** If added later, it would write through `addLessonToCropType` like the other sources (D-033).

---

## Data model

### D-019 — Photos embedded in JournalEntry
**Type:** Technical
**Status:** Superseded by D-020
**Phase:** 2
**Context:** Journal entries have photos, each tagged with zero or more crop types.
**Decision:** Store photos as an array inside each `JournalEntry`. To find the latest photo for a crop type, scan entries newest-first and return the first photo with a matching tag.
**Why superseded:** Finding photos by crop required loading journal entries in bulk. A separate store with an index on crop tags finds them without loading any entries.

### D-020 — EntryPhoto is its own store, indexed by crop tag
**Type:** Technical
**Status:** Current
**Phase:** 2
**Context:** Crop cards and headers need the latest photo for a crop type.
**Decision:** `EntryPhoto` is its own object store. `JournalEntry` holds `photoIds[]`. A `multiEntry` index `by-cropTypeId` on the `cropTypeIds` array makes each photo reachable by any of its tags. Each photo has its own `createdAt` for sorting.
**Alternatives:** Photos embedded in the entry (D-019). Internet-sourced cover photos (D-016).
**Consequences:** `getLatestPhotoByCropType` reads only that crop's photos, then sorts in memory (D-037).

### D-021 — Track unsynced entries via index on `syncedAt`
**Type:** Technical
**Status:** Superseded by D-022
**Phase:** 2
**Context:** Sync & Verify needs to list entries not yet synced.
**Decision:** Index `JournalEntry.syncedAt`; `null` means unsynced.
**Why superseded:** IndexedDB doesn't index records whose key value is `null`, so this index can't return unsynced entries without a full table scan.

### D-022 — Sparse `needsSync` index
**Type:** Technical
**Status:** Current
**Phase:** 2
**Context:** Listing unsynced entries should not scan the whole journal.
**Decision:** New entries are written with `needsSync: 1`. The field is removed when the entry is synced. An index `by-needsSync` covers only records where the field exists, so `getUnsyncedEntries` reads only unsynced records. `syncedAt` is kept as a timestamp.
**Alternatives:** An index on `syncedAt` (D-021).
**Consequences:** When `needsSync` is cleared is covered by D-057.

### D-023 — IDs, test injection, and database singleton
**Type:** Technical
**Status:** Current
**Phase:** 2
**Context:** The data layer needed ID generation and a way to test against a fake IndexedDB.
**Decision:** IDs come from nanoid. `openGardenDB()` takes an injectable `IDBFactory`, defaulting to the browser's; tests pass a fresh fake-indexeddb factory per test. The app uses a module-level promise so the database opens once.
**Alternatives:** Not recorded.
**Consequences:** Each test gets a clean in-memory database.

### D-024 — `yearMonth` denormalized on JournalEntry
**Type:** Technical
**Status:** Current
**Phase:** 2
**Context:** The Journal tab shows one month at a time.
**Decision:** Each entry stores `yearMonth` (`YYYY-MM`), derived from `date` at write time and indexed.
**Alternatives:** Not recorded.
**Consequences:** `getEntriesByMonth` is a single index lookup. Any date edit must update `yearMonth` too (D-049).

### D-025 — `EntryPhoto.entryDate` denormalized
**Type:** Technical
**Status:** Current
**Phase:** 7
**Context:** Yearly instance cards on the Crop Type screen need a photo from that year, and photos didn't carry their entry's date.
**Decision:** Each `EntryPhoto` stores `entryDate`, copied from its entry at creation. `getLatestPhotoByCropTypeAndYear` filters on it. Older photos without `entryDate` are excluded rather than causing an error.
**Alternatives:** Not recorded.
**Consequences:** Editing an entry's date must update its photos' `entryDate` in the same transaction (D-049).

### D-026 — `CropEvent.year` denormalized
**Type:** Technical
**Status:** Current
**Phase:** 8a
**Context:** Open problems are scoped to one season (D-028).
**Decision:** Each `CropEvent` stores `year`, derived from `date` at write time.
**Alternatives:** Joining through `CropInstance` to find the year.
**Consequences:** Queries can filter by season without a second read.

### D-027 — Open problems are problems with no linked fix
**Type:** Technical
**Status:** Superseded by D-028
**Phase:** 2
**Context:** Sync & Verify needs a list of open problems so a new Fix can be linked to one.
**Decision:** `getOpenProblemsByType(cropTypeId)` returned Problem events that had no Fix event linked to them, computed by querying problems and fixes and comparing the two sets.
**Why superseded:** A linked fix doesn't mean the problem is resolved, because a fix can fail. The rule also needed two queries and a set comparison on every call.
**Note:** `getOpenProblemsByType` is still in the code but nothing calls it. Open-problem lookups use `getAllOpenProblems` (D-028).

### D-028 — Stored `resolved` flag, set only by the user
**Type:** Technical
**Status:** Current
**Phase:** 8a
**Context:** Problem status needs to be reliable for linking fixes and for the Issues tab.
**Decision:** Problem events store `resolved`, defaulting to `false`. It becomes `true` only through explicit user action: the checkbox when confirming a Fix (D-071) or a toggle on the Issues tab. `getAllOpenProblems(year)` reads the `by-type` index for problems and filters in memory to unresolved ones from that year. Problems don't carry across seasons.
**Alternatives:** Inferring resolution from a linked fix (D-027).
**Consequences:** One index read per call. Problems can be resolved without any fix, and reopened.

### D-029 — `JournalEntry.updatedAt`
**Type:** Technical
**Status:** Current
**Phase:** 8a
**Context:** An entry can be edited after its AI extraction has been run.
**Decision:** Each entry stores `updatedAt`, bumped on any change to text or photos.
**Alternatives:** Not recorded.
**Consequences:** Used to detect a stale pending extraction (D-073).

### D-030 — PendingExtraction persists review state
**Type:** Technical
**Status:** Current
**Phase:** 8a
**Context:** Reviewing extracted events can be interrupted, and each extraction is a paid API call.
**Decision:** A `PendingExtraction` record per entry holds the extraction, token usage, and `createdAt`. Per-event review state (`EventReview`) is embedded in it as an array; `EventReview` has no store of its own. Reopening an entry resumes the saved review instead of calling the API again.
**Alternatives:** Not recorded.
**Consequences:** Closing the app mid-review loses nothing, and never causes a second charge.

### D-031 — ApiUsageLog
**Type:** Technical
**Status:** Current
**Phase:** 8a
**Context:** API usage should be recorded even though there is no usage UI yet.
**Decision:** An `ApiUsageLog` store records entry ID, date, provider, model, input and output tokens, and `rawUsage`: whatever usage fields the provider returned, such as cache or reasoning tokens.
**Alternatives:** Not recorded.
**Consequences:** No pruning. At one user's scale, years of daily entries stay small.

### D-032 — GeneralNote for crop-less content
**Type:** Technical
**Status:** Current
**Phase:** 8a
**Context:** Some journal content doesn't concern any crop, but `CropEvent` requires a crop instance.
**Decision:** Crop-less content is stored as a `GeneralNote` (`id`, `entryId`, `date`, `text`, optional `isLesson`). `CropEvent.cropInstanceId` stays required.
**Alternatives:** Making the crop optional on `CropEvent`, or forcing the user to pick a crop. Neither was adopted.
**Consequences:** Lessons marked `isLesson` appear on Next Season (D-014). Other general notes have no display yet (D-015).

### D-033 — Lessons embedded in CropType
**Type:** Technical
**Status:** Current
**Phase:** 2
**Context:** Lessons belong to a crop type and last across seasons.
**Decision:** Lessons are stored in `CropType.lessons`. Every source (AI extraction, "Notes for next season", manual entry on the Crop Type screen) writes through `addLessonToCropType`.
**Alternatives:** Not recorded.
**Consequences:** A new instance of an existing crop type inherits its lessons automatically.

### D-034 — No migrations; a schema version bump means wipe first
**Type:** Technical
**Status:** Current
**Phase:** 7a
**Context:** The schema changes often during development, and the app runs on one device.
**Decision:** No upgrade handler ever tries to preserve data across a schema version bump. Before a version bump, the database is wiped with `resetDatabase()` (D-081) and reloaded.
**Alternatives:** Incremental migrations in the `upgradeneeded` handler.
**Consequences:** Local data is lost at each version bump (see D-017). To be revisited before the first release.

### D-035 — AI provider and model are free-text strings
**Type:** Technical
**Status:** Current
**Phase:** 7c
**Context:** Providers and model names change over time.
**Decision:** `aiProvider` and `aiModel` are plain strings in Settings, not union types, and model names never appear in code or schema.
**Alternatives:** A union type for providers.
**Consequences:** Adding a provider or changing models needs no schema change.

### D-036 — Mutation functions return the affected record
**Type:** Technical
**Status:** Current
**Phase:** 7b
**Context:** Sync & Verify flows (resolving instances, cascade writes, setting `resolved`) need the written record straight away.
**Decision:** Every create, update, and delete function returns the affected record instead of `void`. Query functions are unchanged.
**Alternatives:** Keeping `void` and reading the record back.
**Consequences:** No second read after a write.

### D-037 — No compound indexes
**Type:** Technical
**Status:** Current
**Phase:** Cross-cutting
**Context:** Some queries filter on more than one field, such as type and year.
**Decision:** Fetch with a single index, then filter and sort in memory.
**Alternatives:** Compound indexes.
**Consequences:** Fewer indexes to maintain. Fine at personal scale, where result sets stay small.

### D-038 — Photos stored as base64 data URLs
**Type:** Technical
**Status:** Superseded by D-039
**Phase:** 2
**Context:** Photos need to be stored offline in IndexedDB.
**Decision:** Store each photo as a base64 `dataUrl` string, after resizing.
**Why superseded:** base64 makes each photo roughly 33% larger, and encoding and decoding it costs significant CPU and memory.

### D-039 — Photos resized to JPEG, stored as ArrayBuffer
**Type:** Technical
**Status:** Current
**Phase:** 4
**Context:** Raw camera images are large enough to fill IndexedDB quickly, and storing Blobs in IndexedDB is unreliable in WebKit.
**Decision:** When a photo is added, `resizeToBlob()` draws it onto a canvas scaled so the long edge is at most 1200px, then exports it as a JPEG Blob at quality 0.85. Smaller images are never scaled up. Resizing lives in a shared module used by every screen that accepts photos. The photo is stored in IndexedDB as an ArrayBuffer, not as a Blob.
**Alternatives:** base64 data URLs (D-038). Storing the Blob directly, avoided because of WebKit's unreliable Blob storage in IndexedDB.
**Consequences:** Every stored photo is a JPEG, whatever the original format.

### D-040 — CareTask schedule as free text
**Type:** Technical
**Status:** Deferred
**Phase:** 11
**Context:** The first build plan defined `CareTask.schedule` as free text, such as "Every 2 weeks".
**Decision:** Deferred with the Care tab's purpose (D-013). Free text fits the informational intent; interval or date scheduling fits the care-management intent.
**Alternatives:** Interval or specific-date scheduling (screen spec).
**Consequences:** None until the Care tab is picked up.

### D-041 — Store review outcomes to measure AI performance
**Type:** Technical
**Status:** Planned, not built
**Phase:** 8d
**Context:** The quality of AI extraction should be measurable from real use.
**Decision:** A store records the outcome of each reviewed event: confirmed as-is, confirmed after editing, dismissed, or added manually because the AI missed it.
**Alternatives:** Not recorded.
**Consequences:** Store design and exact fields are still open.

---

## Entry & crop UI

### D-042 — Built screens are documented with screenshots
**Type:** Product
**Status:** Current
**Phase:** Cross-cutting
**Context:** Screens were designed in conversation, and not all design mockups were kept.
**Decision:** No mockups are made after the fact for screens that are already built. Screenshots of the built screens document them instead.
**Alternatives:** Not recorded.
**Consequences:** Screen documentation reflects what was built, not what was planned.

### D-043 — Native date input on New Entry
**Type:** Product
**Status:** Superseded by D-044
**Phase:** 4
**Context:** New entries need a garden date, which may differ from the day of writing.
**Decision:** A native date input, styled to the app palette, defaulting to today.
**Why superseded:** The date defaulted silently to today, so a wrong date (for example, writing about yesterday late at night) was easy to miss.

### D-044 — Prominent weekday and date pill
**Type:** Product
**Status:** Current
**Phase:** 4b
**Context:** A wrong entry date should be obvious before saving.
**Decision:** The date is shown as a large pill with weekday and date (for example, "Tuesday, 16 June"), styled like the entry card header. Tapping it opens the native date picker.
**Alternatives:** Allowing the date to be edited later instead. At the time, the pill was chosen instead of adding date editing.
**Consequences:** Entry editing is now also planned (D-049), so wrong dates can be both prevented and corrected.

### D-045 — Weather is filled at sync, never at save
**Type:** Product
**Status:** Current
**Phase:** Screen spec
**Context:** Saving must work offline.
**Decision:** Weather for an entry's date is fetched during sync. Saving never waits on a network call.
**Alternatives:** Not recorded.
**Consequences:** New entries show no weather until synced.

### D-046 — Untagged photos are allowed
**Type:** Product
**Status:** Current
**Phase:** 4
**Context:** Tagging every photo while writing adds friction.
**Decision:** Photos can be saved without crop tags. Tags can be adjusted later in the Sync & Verify review.
**Alternatives:** Not recorded.
**Consequences:** Untagged photos don't appear as crop cover photos and aren't attached to events (D-074) until tagged.

### D-047 — "Notes for next season" is a collapsible field
**Type:** Product
**Status:** Current
**Phase:** Screen spec
**Context:** Next-season thoughts need a place in the entry without adding structure.
**Decision:** A collapsible "Notes for next season" field on New Entry. There is no "next season" toggle or checkbox; AI extraction handles the rest.
**Alternatives:** A toggle or checkbox, rejected in the screen spec.
**Consequences:** The field's contents are sent to extraction (D-061).

### D-048 — Photo-only entry behavior
**Type:** Product
**Status:** Planned, not built
**Phase:** Not yet assigned
**Context:** An entry can have photos but no text.
**Decision:**
- The entry card omits the text block when there's no text.
- Save is disabled when there's neither text nor a photo, shown as a greyed button rather than an error.
- The feed sorts by date descending, with `createdAt` descending as a tiebreaker for entries on the same date.

**Alternatives:** Not recorded.
**Consequences:** Photo-only entries skip extraction and are marked synced once weather is filled (D-057).

### D-049 — Entries are editable from a detail view
**Type:** Product
**Status:** Planned, not built
**Phase:** Not yet assigned
**Context:** Mistakes in an entry's text or date need a fix after saving.
**Decision:** An entry detail view allows editing text and date. The all-entries feed stays read-only. A date edit updates `yearMonth` (D-024) and each photo's `entryDate` (D-025) in one readwrite transaction.
**Alternatives:** Not recorded.
**Consequences:** Still open:
- Refetching weather for the new date.
- Re-resolving events to a different crop instance if the year changes.
- What happens when an entry is edited after its events were committed. The staleness check (D-073) covers only pending extractions.

### D-050 — Missing-instance nudge when tagging
**Type:** Product
**Status:** Current
**Phase:** 4c
**Context:** A photo can be tagged with a crop that has no instance for the entry's year, which later shows up only as an empty list on the Crop Type screen.
**Decision:** When a crop is tagged and `hasInstanceForYear` is false, the tag sheet shows a nudge under that crop with "Create now" and "Later". It never blocks tagging or saving.
**Alternatives:** Catching this only in Sync & Verify. Rejected because tagging already has the information offline; Sync & Verify remains a second check for crops mentioned only in text (D-070).
**Consequences:** Shares its creation form with Sync & Verify (D-051).

### D-051 — Shared InstanceQuickCreate component
**Type:** Technical
**Status:** Current
**Phase:** 4c
**Context:** Crop instances are created from several places.
**Decision:** `InstanceQuickCreate` takes a required `cropTypeId`, a prefilled year, and optional variety and source prefill values. New Crop accepts `?cropTypeId=` to skip crop type search and render this component directly.
**Alternatives:** Not recorded.
**Consequences:** The prefill values are used by Nursery Pickup events in Sync & Verify (D-070).

---

## Sync & AI

### D-052 — Open-Meteo historical weather using stored coordinates
**Type:** Technical
**Status:** Current
**Phase:** 8b
**Context:** Open-Meteo's archive API needs latitude and longitude, not a place name.
**Decision:** Coordinates are resolved once in Settings (D-054), stored, and reused for every weather fetch. If they're missing, sync shows a message pointing to Settings.
**Alternatives:** Using the place name alone, which doesn't work with the archive API.
**Consequences:** Weather accuracy depends on the stored coordinates being right.

### D-053 — Location geocoded on blur
**Type:** Technical
**Status:** Superseded by D-054
**Phase:** 7c
**Context:** Settings needs coordinates for weather.
**Decision:** When the location field loses focus, geocode the text and store the single best match's coordinates.
**Why superseded:** A single best guess can't show ambiguity when several places share a name, and the user has no chance to confirm the match before it's used for every weather fetch.

### D-054 — Location from device GPS or a disambiguated search
**Type:** Technical
**Status:** Current
**Phase:** 7c addendum
**Context:** Coordinates must be correct, and the user should be able to confirm them.
**Decision:**
- A "Use current location" button calls `getCurrentPosition()` once, only when tapped. The name is reverse-geocoded for display; raw coordinates are shown if that fails.
- A typeahead search lists results with region and country, and the user picks one.
- There is no silent geocode on blur. If the field has text but no coordinates, a note asks the user to pick a result.

**Alternatives:** `watchPosition()`. Requesting location permission on page load. Geocoding on blur (D-053).
**Consequences:** One permission prompt, only on explicit tap.

### D-055 — Weather sync is independent of the AI outcome
**Type:** Technical
**Status:** Current
**Phase:** 8b
**Context:** AI extraction is more likely to fail than a weather fetch.
**Decision:** Weather is fetched and written to entries whether or not extraction succeeds or runs at all.
**Alternatives:** Not recorded.
**Consequences:** Weather can be tested and trusted before extraction exists.

### D-056 — Entries skipped for missing AI configuration count as synced after weather
**Type:** Technical
**Status:** Superseded by D-057
**Phase:** 8c
**Context:** An entry with text can't be extracted if the AI provider, model, or key isn't set.
**Decision:** Such entries could still be marked synced once weather was filled; they just never produced review cards.
**Why superseded:** An entry marked synced drops out of the unsynced list, so an entry skipped only because AI wasn't configured yet would never be extracted later.

### D-057 — When `needsSync` clears
**Type:** Technical
**Status:** Current
**Phase:** 8c
**Context:** The unsynced list drives Sync & Verify, and some entries have nothing to extract.
**Decision:**
- Entries with text: `needsSync` clears only after the extraction has been reviewed and confirmed.
- Entries with no text (photo-only): nothing to extract, so `needsSync` clears once weather is filled.
- Entries with text but no AI configuration: stay unsynced until AI is configured and the extraction is reviewed.

**Alternatives:** Clearing after weather when AI is skipped for missing configuration (D-056).
**Consequences:** AI is expected to be configured at all times; the unconfigured case is a fallback, not a normal state.

### D-058 — AI calls from the browser with the user's own key
**Type:** Technical
**Status:** Current
**Phase:** 8c
**Context:** The app has no backend (D-006).
**Decision:** AI providers are called directly from the browser, using an API key the user enters in Settings.
**Alternatives:** A backend or proxy.
**Consequences:** The key is stored on the device. No server to run or secure.

### D-059 — AIProvider abstraction
**Type:** Technical
**Status:** Current
**Phase:** 8a
**Context:** More than one AI provider should be usable.
**Decision:** An `AIProvider` interface in `lib/ai/` with an `extract()` method. Provider and model come from Settings (D-035), never from code.
**Alternatives:** Not recorded.
**Consequences:** Providers share one interface; the extraction spec is shared across them.

### D-060 — Zod is the single source for the extraction schema
**Type:** Technical
**Status:** Current
**Phase:** 8a
**Context:** An AI response is untrusted input, and TypeScript types don't exist at runtime.
**Decision:** The extraction schema is one Zod object in `lib/ai/extractionSpec.ts`. From it come the tool schema sent to the model (via `zod-to-json-schema`), runtime validation (`.parse()`), and the TypeScript type (`z.infer`).
**Alternatives:** Not recorded.
**Consequences:** The tool definition and the validator can't drift apart. A malformed response fails loudly.

### D-061 — "Notes for next season" is sent to extraction
**Type:** Technical
**Status:** Planned, not built
**Phase:** 8c
**Context:** Next-season notes are a main source of lessons.
**Decision:** `nextSeasonNote` is included in the extraction input, inside the same data-tag boundary as the entry text (D-064).
**Alternatives:** Not recorded.
**Consequences:** Lessons can come from either field.

### D-062 — Crop roster sent as names only; exact matching
**Type:** Technical
**Status:** Current
**Phase:** 8c
**Context:** Extracted events must be matched to known crops.
**Decision:** The model receives crop names only, with no IDs, and returns a matched name exactly as spelled or `null`. The app finds the ID by an exact, trimmed, lowercase comparison.
**Alternatives:** Fuzzy or edit-distance matching in app code. Rejected because the model has already done the meaning-based matching.
**Consequences:** A name the model misspells resolves to no crop, and the user fixes it in review.

### D-063 — Ephemeral problem labels
**Type:** Technical
**Status:** Current
**Phase:** 8c
**Context:** The model needs to link a Fix to an open problem.
**Decision:** Open problems are sent with per-call labels (`P1`, `P2`, …) plus crop name, date, and a notes excerpt. The model returns a label; the app maps it to a real ID and discards the label. No ID from a model response ever reaches the database directly.
**Alternatives:** Sending real database IDs. Matching on the problem's text, which is less reliable than echoing a label.
**Consequences:** Every ID in the database was resolved by app code against app data.

### D-064 — Prompt-injection boundary
**Type:** Technical
**Status:** Current
**Phase:** 8c
**Context:** Entry text, crop names, and problem excerpts are user-written and go into the prompt.
**Decision:** All user-written content is wrapped in explicit data tags, with a system instruction not to follow instructions inside them. Forcing a tool response helps. The real safeguard is that nothing is saved without the user's Confirm.
**Alternatives:** Not recorded.
**Consequences:** Review is required for safety, not only for accuracy.

### D-065 — Extraction rules
**Type:** Product
**Status:** Current
**Phase:** 8c
**Context:** The model needs consistent rules for classifying events.
**Decision:**
- A Fix requires a previously identified Problem.
- Routine care (watering, scheduled fertilizing, staking) is not a Fix. It's an Observation if noteworthy, otherwise not extracted.
- Extraction never creates care tasks.
- One event per crop, even within a single sentence.
- Content with no crop becomes type `general`.
- Relative dates ("yesterday") are resolved against the entry date. The app clamps unreasonable results and falls back to the entry date.
- Notes are near-verbatim excerpts: no paraphrase, no invented detail.

**Alternatives:** Not recorded.
**Consequences:** These rules live in the shared extraction spec (D-060).

### D-066 — AI configuration checked on every sync
**Type:** Technical
**Status:** Current
**Phase:** 8c
**Context:** A request without a provider, model, or key would fail.
**Decision:** Before each extraction, check that provider, model, and the matching API key are all set. If not, skip the call and show a message pointing to Settings. The check runs on every sync, not once.
**Alternatives:** Not recorded.
**Consequences:** Mirrors the coordinate check for weather (D-052). Skipped entries stay unsynced (D-057).

### D-067 — Usage logged before validation; no partial saves
**Type:** Technical
**Status:** Current
**Phase:** 8c
**Context:** A response can be billed and still fail validation.
**Decision:** Usage is logged as soon as a response with usage data arrives, before Zod validation. If the call fails, no `PendingExtraction` is saved.
**Alternatives:** Not recorded.
**Consequences:** Billed calls are always recorded. A failed call leaves nothing half-written.

### D-068 — No automatic retries
**Type:** Technical
**Status:** Current
**Phase:** 8e
**Context:** Retrying a paid call automatically could charge twice for a transient error.
**Decision:** Failed extractions show a manual Retry button. While a call is in flight, Retry is disabled.
**Alternatives:** Automatic retries.
**Consequences:** A slow response can't collide with a second request.

### D-069 — Review card states
**Type:** Product
**Status:** Current
**Phase:** 8d
**Context:** Every extracted event needs an explicit decision.
**Decision:** Each card is pending, confirmed, or dismissed.
- Confirm is enabled only once crop and instance are resolved, or the event is `general`. It can be undone.
- Dismiss is always available and can be undone.
- Edit returns the card to pending.
- Done stays disabled while any card is pending.

**Alternatives:** Not recorded.
**Consequences:** Nothing is committed without a decision on every card.

### D-070 — Missing instance blocks Confirm
**Type:** Product
**Status:** Current
**Phase:** 8d
**Context:** `CropEvent` requires a crop instance, and the model only matches crop types.
**Decision:** The app looks up the instance from crop type and the entry's year. If none exists, the card shows a blocking notice and Confirm is disabled until the user creates one through `InstanceQuickCreate`. For Nursery Pickup events, nursery name and variety from the extraction prefill the form.
**Alternatives:** Letting the model pick an instance. A silent empty state, as on the Crop Type screen, which isn't possible here because the instance is required.
**Consequences:** The same check as the tagging nudge (D-050), but blocking instead of advisory.

### D-071 — "Mark resolved" checkbox on Fix, unchecked by default
**Type:** Product
**Status:** Current
**Phase:** 8d
**Context:** Confirming a fix shouldn't close a problem automatically (D-028).
**Decision:** When confirming a Fix linked to a problem, a checkbox asks whether to mark the problem resolved. It defaults to unchecked. If checked, `resolved: true` is written to the problem.
**Alternatives:** Inferring resolution from the link (D-027).
**Consequences:** A problem stays open unless the user says otherwise.

### D-072 — Entry text is read-only in Sync & Verify
**Type:** Product
**Status:** Current
**Phase:** Screen spec
**Context:** The review screen shows the entry as a fixed reference.
**Decision:** Entry text can't be edited during review. Editing happens in the entry detail view (D-049).
**Alternatives:** Not recorded.
**Consequences:** Edits made elsewhere trigger the staleness check (D-073).

### D-073 — Re-run and staleness handling
**Type:** Product
**Status:** Current
**Phase:** 8e
**Context:** An extraction can become outdated or unwanted.
**Decision:** "Re-run extraction" is always available and warns before discarding confirmed cards. Re-running discards the existing `PendingExtraction`, including its embedded review state. When a review is reopened, if the entry's `updatedAt` is later than the extraction's `createdAt`, the user must re-run, with the same warning.
**Alternatives:** Not recorded.
**Consequences:** A review never silently runs against changed text.

### D-074 — Photos attached to confirmed events by tag
**Type:** Product
**Status:** Planned, not built
**Phase:** 8d
**Context:** Events on a crop timeline should show relevant photos.
**Decision:** When Done is tapped, each confirmed event gets every photo from the entry whose tags include the event's crop, using tags as they stand at that moment. Each card has an option to change the selection.
**Alternatives:** Not recorded.
**Consequences:** Adjusting tags during review changes which photos are attached.

---

## Infrastructure & testing

### D-075 — next-pwa for the service worker
**Type:** Technical
**Status:** Superseded by D-076
**Phase:** 1
**Context:** The app needs a service worker to work offline as an installed PWA.
**Decision:** Use next-pwa with static export.
**Why superseded:** next-pwa is no longer maintained. Workbox offers cleaner abstractions and more control over configuration.

### D-076 — Workbox `injectManifest` with a custom build script
**Type:** Technical
**Status:** Current
**Phase:** 1
**Context:** The service worker needs explicit control over what is cached, and next-pwa was no longer maintained.
**Decision:** Workbox in `injectManifest` mode, run by `scripts/build-sw.mjs` after the static export:
- `injectManifest` injects the precache list into `src/sw.js`, writing a temporary file. The list covers HTML, text files, `_next/static` JS and CSS, images, fonts, and `manifest.json` from `out/`, with every URL prefixed by the base path.
- Rollup then bundles that file with the Workbox packages into a single IIFE at `out/sw.js`, and the temporary file is deleted. Injecting before bundling means the manifest placeholder appears exactly once when Workbox scans the source.

At runtime, `src/sw.js`:
- Precaches the build output, ignoring the `id` and `_rsc` query parameters when matching requests to cached files.
- Serves every navigation from the precached `index.html` app shell, except paths matching `_next` or `/api/`.
- Deletes caches left by older Workbox versions.
- Calls `clientsClaim()`, so a newly activated worker controls open pages immediately.
- Registers no runtime routes. Requests outside the precache, including Open-Meteo and AI calls, go to the network and are never cached.

**Alternatives:** next-pwa (D-075).
**Consequences:**
- The app loads fully offline from the precache.
- Weather and AI responses are never served from cache.
- The worker doesn't call `skipWaiting()`. A newly deployed version installs but only activates once every window of the app has been closed.

### D-077 — Fixed `start_url`; install from Safari
**Type:** Technical
**Status:** Current
**Phase:** 1
**Context:** The app is hosted under a subpath and installed on iPhone.
**Decision:** `start_url` stays `/garden-journal/`. On iOS the app installs from Safari only.
**Alternatives:** Not recorded.
**Consequences:** Changing the path would break installed copies.

### D-078 — GitHub Pages artifact deploy
**Type:** Technical
**Status:** Current
**Phase:** 1
**Context:** The static export needs hosting and a CI pipeline.
**Decision:** GitHub Actions runs Vitest, then the build, then deploys a Pages artifact.
**Alternatives:** A `gh-pages` branch.
**Consequences:** A failing test blocks deployment.

### D-079 — Test only in the home-screen app
**Type:** Technical
**Status:** Current
**Phase:** Cross-cutting
**Context:** On iOS, Safari and the installed home-screen app keep separate storage, even for the same origin.
**Decision:** On-device testing happens only in the installed home-screen app.
**Alternatives:** Not recorded.
**Consequences:** Data entered in Safari isn't visible in the installed app, and the reverse.

### D-080 — Testing approach
**Type:** Technical
**Status:** Current
**Phase:** Cross-cutting
**Context:** Different parts of the app fail in different ways.
**Decision:**
- Vitest with fake-indexeddb, test-first, for data-layer query functions and AI schemas.
- Playwright end-to-end tests.
- Manual on-device checks after each phase.

**Alternatives:** Component tests with Testing Library, rejected because they would mostly assert behavior the browser already guarantees.
**Consequences:** Simple CRUD functions don't get their own tests.

### D-081 — Database wipe button, always visible, first in Settings
**Type:** Technical
**Status:** Current
**Phase:** 7a, 7c
**Context:** Schema bumps require a wipe (D-034), including on the deployed app.
**Decision:** `resetDatabase()` deletes and recreates the database. A "Wipe local database" button is the first item in Settings, always visible, and asks for confirmation before running.
**Alternatives:** Hiding the button in production builds. Rejected because it would disappear on the deployed app, exactly where on-device testing happens. A temporary developer-only route was used before Settings existed.
**Consequences:** One tap plus a confirmation erases all local data.

### D-082 — Navigation denylist in the service worker
**Type:** Technical
**Status:** Current
**Phase:** 1
**Context:** The `NavigationRoute` in `src/sw.js` serves the precached `index.html` shell for any navigation not already matched by the precache. A denylist exempts `/_next/` and `/api/` paths from that fallback.
**Decision:** Keep the denylist patterns as `[/^\/_next\//, /\/api\//]`. Do not modify them without testing navigation on-device.

The patterns appear mismatched to the app's URL structure at first glance: all precached assets are prefixed with the base path (`/garden-journal/_next/static/…`), so the anchored pattern `/^\/_next\//` would not exclude a navigation to `/garden-journal/_next/…`. However, this mismatch is harmless in practice: `_next/static/` JS and CSS files are loaded as subresource fetches, not navigation requests, so they never reach `NavigationRoute` at all. The patterns work empirically, but the interaction between the base-path prefix and the regex anchoring is subtle enough that changes carry real risk on iOS Safari.

**Alternatives:** Not recorded.
**Consequences:** Navigation to all app pages works offline. The exact mechanism depends on this specific regex/base-path interaction; any edit must be verified on-device before merging.
