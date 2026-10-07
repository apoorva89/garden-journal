# ARCHITECTURE

> This document is a guided tour of Garden Journal's source code. It follows the style described by Aleksey Kladov in [*ARCHITECTURE.md*](https://matklad.github.io/2021/02/06/ARCHITECTURE.md.html): a map of the codebase and its invariants, not a description of the tech stack. The goal is to answer "where is the code that does X, and what must never happen there?"

<!-- diagram placeholder -->

---

## 1. Overview

Garden Journal is a personal, offline-first PWA for tracking one user's growing season. There is no backend, no server, and no authentication. All data lives in IndexedDB on the device. See D-005, D-006, D-058.

The data falls into two kinds:

- **Ground state:** journal entries and photos. Written at save time; never needs the network.
- **Derived state:** weather for each entry, and structured crop events extracted from the entry text. Produced only when the user taps **Sync**. Extracted events reach the crop timeline only after the user confirms each one.

The network is used for three things, all directly from the browser: historical weather (Open-Meteo), AI extraction (the user's chosen provider, with their own API key), and location search (a geocoding API, Settings only). Saving never blocks on the network (D-010, D-045).

The core loop: write an entry, offline if needed. At a convenient time, sync it. Review each extracted event and confirm or dismiss it. Confirmed events and lessons are filed under the relevant crop, or as general notes shown in the Next Season tab.

---

## 2. Code map

Dependencies run one way: `app/` → `components/` → `lib/`. The rules are in §9.

### `lib/`

The data and logic layer. UI does not appear here.

| File | Purpose |
|---|---|
| `lib/db.ts` | IndexedDB schema and all reads and writes. The only module that touches IndexedDB, and the source of truth for stored types. See §3. |
| `lib/sync.ts` | Sync orchestrator. Runs the weather and extraction steps for unsynced entries and writes the results through `lib/db.ts`. See §4. |
| `lib/geocode.ts` | Geocoding client for location search in Settings. |
| `lib/ai/extractionSpec.ts` | One Zod schema for extracted events; the model's tool schema and the TypeScript type are both derived from it. See §5. |
| `lib/ai/provider.ts` | The interface between the app and any AI provider: a single `extract()` method. |
| `lib/weatherSync.ts` | Open-Meteo client. Returns weather for a date and location; network errors return `null`. |
| `lib/resizeImage.ts` | Downscales and re-encodes photos before storage. Used wherever photos are accepted. |

### `app/`

Next.js App Router, fully static export; every page is a client component. Screens live in the `(tabs)` route group, which shares a tab shell: Journal, Crops, Next Season, Settings. `/` redirects to `/journal`. `app/dev/` is a developer wipe route. `manifest.ts` and `sw-register.tsx` wire up PWA install and the service worker (§6, §7).

### `components/`

Shared UI building blocks. `components/journal/SyncSheet.tsx` is the view for sync: it lists unsynced entries and starts `lib/sync.ts` (§4). The rest is the tab bar, entry feed and cards, calendar strip, crop cards, and bottom sheets.

### Build and PWA

| File | Purpose |
|---|---|
| `base-path.mjs` | Single source of truth for the app's subpath. GitHub Pages serves the site at `/garden-journal/`. Used by build config, manifest generation, and service worker registration. |
| `src/sw.js` | Service worker source. See §6. |
| `scripts/build-sw.mjs` | Post-build step that produces `out/sw.js`. See §6. |

### Tests

`lib/__tests__/` (unit) and `e2e/` (Playwright). See §8.

---

## 3. Data model

One IndexedDB database, `garden-journal`. Stores, indexes, and types are defined in `GardenDBSchema` in `lib/db.ts`; this document doesn't duplicate them.

There is no migration path. `openGardenDB()` creates all stores in a single `upgradeneeded` handler, and a schema change requires wiping the database (D-034, D-081). All indexes are single-field. Queries that need more than one dimension fetch by one index and filter in memory (D-037).

### Denormalized fields and their cascade rules

| Field | Derived from | Why | Rule |
|---|---|---|---|
| `JournalEntry.yearMonth` | `date` | Month queries use a direct index lookup | Set on create. A date edit must update it, together with `EntryPhoto.entryDate`, in one transaction: `updateJournalEntryAndPhotoDates` (D-025). |
| `EntryPhoto.entryDate` | the entry's `date` | Photo-by-year queries filter without a join | Set on create. Same cascade as above. |
| `CropEvent.year` | `date` | Open-problem queries filter by year without a join | Set on create (D-026). |

### Sparse `needsSync` index (D-022)

New entries are written with `needsSync: 1`. IndexedDB leaves a record out of an index when the indexed field is absent, so `by-needsSync` contains only unsynced entries and finding them never scans the whole store. To mark an entry synced, delete the field. Setting it to `0` would keep the entry in the index.

### Photo storage

Photos are resized before storage and stored as `ArrayBuffer`, not `Blob`, because WebKit's Blob storage in IndexedDB is unreliable. `toStored` and `fromStored` in `lib/db.ts` convert at the boundary, so callers only ever see `Blob`.

---

## 4. Sync pipeline

Sync starts only when the user taps **Sync** in the Journal tab (D-010). `lib/sync.ts` runs it; `SyncSheet` is the view that lists unsynced entries and starts the sync.

For each unsynced entry there are two independent steps:

- **Weather.** Fetched from Open-Meteo using the location in Settings and written back to the entry. Weather is written whether or not extraction runs (D-055). A failed fetch yields no weather for that entry and does not stop the sync.
- **Extraction.** The entry text, the crop roster, and open problems go to the AI provider. The response is validated (§5) and saved as a `PendingExtraction` holding one `EventReview` per extracted event (D-030). The user confirms or dismisses each one. Confirm writes to the crop timeline; dismiss writes nothing.

Before extraction, the pipeline checks that provider, model, and API key are configured (D-066). Token usage is logged as soon as a response arrives, before validation, so billed calls are always recorded even when the response is rejected (D-067). Extraction is never retried automatically; a failure shows a Retry button.

`needsSync` clears when an entry is fully processed: after its review is confirmed if it has text, or after weather is filled if it is photo-only (D-057). Re-running extraction discards the `PendingExtraction` and warns if any card was already confirmed. A review is stale if the entry was edited after the extraction was created (`entry.updatedAt > pendingExtraction.createdAt`) and must be re-run (D-073).

---

## 5. AI trust boundary

Entry text is untrusted input to the model: a pasted web page or a crafted note can contain instructions. These rules apply to any provider implementation. Defenses are layered, and only the last is a guarantee:

1. **Data tags (D-064).** User-written content (entry text, `nextSeasonNote`, crop names, problem excerpts) is wrapped in explicit data tags, and the system prompt tells the model not to follow instructions inside them.
2. **Forced tool call.** The model must answer through a tool schema, which constrains the shape of its output.
3. **Validation (D-060).** Every response is parsed against `ExtractedEventSchema` before use.
4. **No database IDs (D-062, D-063).** The model sees and emits names and ephemeral labels only: `matchedRosterName` is a crop name, `linkedProblemRef` is a per-call label such as `P1`. App code resolves both to database IDs after parsing, so no ID from a model response is ever written directly.
5. **Human confirm.** Nothing reaches `cropEvents`, `generalNotes`, or `CropType.lessons` until the user taps Confirm on that card. A prompt injection that produces a plausible extraction can still only reach the database through the user's own approval.

### One schema, three outputs

`lib/ai/extractionSpec.ts` defines `ExtractedEventSchema` once. The tool definition sent to the model, the runtime validator, and the TypeScript type are all derived from it, so they cannot drift apart. Never hand-write a second schema or type for extracted events.

### API keys and provider config

API keys are entered in Settings and stored in `Settings.apiKeys` in IndexedDB. They leave the device only as the Authorization header on a request from the browser to the provider. There is no proxy. Provider and model are Settings values, never hard-coded.

---

## 6. Service worker and offline

Next's static export does not produce a service worker. `scripts/build-sw.mjs` builds it after `next build`: Workbox's `injectManifest` fills in the precache list from `out/`, then Rollup bundles the result into a single `out/sw.js`. Every precached URL is prefixed with `BASE_PATH`. Registration happens in production only (`app/sw-register.tsx`).

Runtime strategy:

- **Precache everything.** The app works fully offline after first load.
- **One app shell.** Navigations are served from the precached `index.html`, except paths under `/_next/` and `/api/`.
- **No runtime caching.** Open-Meteo, AI provider, and geocoding requests are never cached and need the network.

### Sharp edges

- **`skipWaiting` is not called.** A newly deployed worker installs but waits until every window of the app is closed, so users see new code only after closing and reopening the app. Whether this is deliberate is tracked in [#18](https://github.com/apoorva89/garden-journal/issues/18).
- **The navigation denylist has edge cases** with the static export's URL structure. Test navigation on-device before changing it (D-082).

---

## 7. Platform notes

### iOS storage (D-079)

On iOS, Safari and the installed home-screen app use separate storage sandboxes, even for the same origin. Data written in one is invisible to the other.

The two also differ in durability. Safari deletes a site's script-writable storage, IndexedDB included, after seven days of Safari use without interaction with the site. Home-screen apps are exempt and have their own usage counter. All data lives in IndexedDB with no server copy, so the installed app is the only safe way to use Garden Journal on iOS. Test on-device only in the installed app.

### Base path and installed copies (D-077)

`start_url` and `scope` in `app/manifest.ts` are both `BASE_PATH + '/'`. Changing the base path breaks installed copies of the app.

---

## 8. Testing, errors, and build

### Testing

Tests sit at two boundaries, plus manual checks.

- **`lib/` (Vitest).** Node environment; no DOM is needed. `openGardenDB` takes an `IDBFactory` parameter, and each test passes a fresh `fake-indexeddb` instance, so every test gets an isolated in-memory database. These tests cover data-layer queries and cascades, schema parsing, and the weather client with `fetch` stubbed. They use no network.
- **UI (Playwright).** The e2e specs in `e2e/` run in Chromium and WebKit. They cover navigation, the entry and crop flows, settings, and the service worker.
- **On-device.** Manual, in the installed home-screen app, after each phase. Checks in a Safari tab don't count (§7).

### Error handling

Network failures degrade a feature; they never block saving. Save paths make no network calls.

- A failed weather fetch returns `null`. That entry gets no weather and sync continues.
- A failed or invalid AI response saves nothing and shows a Retry button. The code never retries automatically. Usage for a billed call is still logged (§4), so a failed call leaves nothing half-written.

### Build and deploy

`npm run build` runs `next build` (static export to `out/`), then `scripts/build-sw.mjs`. Both must succeed. CI (`.github/workflows/deploy.yml`) runs the unit and e2e tests, builds, and deploys `out/` to GitHub Pages at `/garden-journal/`. A failing test blocks deploy.

---

## 9. Invariants

These must not be violated. Coding agents should check this list before writing code that touches the relevant paths.

### Layering

1. Dependencies run one way: `app/` → `components/` → `lib/`. `lib/` never imports from `components/` or `app/`, and `components/` never imports from `app/`.
2. Only `lib/db.ts` touches IndexedDB.
3. Network-facing modules (`lib/weatherSync.ts`, `lib/geocode.ts`, AI providers) never touch the database. The sync orchestrator reads and writes; they only fetch.
4. Network calls originate in `lib/`.

### Storage

5. All writes go to IndexedDB first. Save paths make no network calls.
6. No migration code. The `upgradeneeded` handler creates all stores from scratch, with no version checks.
7. A date edit updates the entry and all its photos' `entryDate` in one `readwrite` transaction spanning both stores (§3).
8. `needsSync` is `1` or absent, never `0` or `false` (§3).
9. Photos are stored as `ArrayBuffer`; the store never contains a `Blob` (§3).
10. All indexes are single-field (§3).
11. Every create, update, and delete function in `lib/db.ts` returns the affected record (D-036).

### Network, sync, and AI

12. No backend or proxy. External calls go directly from the browser to Open-Meteo, a geocoding API, and the AI provider.
13. Weather and AI calls happen only in the sync orchestrator, started by the user, never at save.
14. Nothing reaches `cropEvents`, `generalNotes`, or `CropType.lessons` until the user confirms that card.
15. The model never sees database IDs. `matchedRosterName` is a name and `linkedProblemRef` is an ephemeral label; app code resolves both after parsing.
16. User-written text in the extraction prompt (entry text, `nextSeasonNote`, crop names, problem excerpts) is wrapped in explicit data tags.
17. `ExtractedEventSchema` is the single source for extraction types. Derive the tool schema and the TypeScript type from it; never write a second one.
18. Provider and model are Settings values. No provider name or model ID appears in source code.
19. No automatic AI retries.
20. Geolocation is one-shot, requested only on user tap. `watchPosition` is never used.
