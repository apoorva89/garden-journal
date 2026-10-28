# Issue #31 — Extract network calls into lib/orchestrator/

## 1. Scope

Refactor only. No behaviour changes. No new features. Part of pre-8d-2 cleanup.

Extract the two inline `fetch` calls from `app/(tabs)/settings/page.tsx` into `lib/orchestrator/geocode.ts`. Move the `GeoResult` type there too. Add stub files for future weather and AI network modules.

**Note on pre-existing divergence:** `lib/geocode.ts` does not exist in the codebase. ARCHITECTURE.md §2 already lists it as if it does — that entry was stale before this phase. This phase both fixes that code→docs divergence and establishes the correct landing path (`lib/orchestrator/geocode.ts` rather than the flat `lib/geocode.ts` shown in §2).

**Note on weather stub:** `lib/orchestrator/weather.ts` is a placeholder for future weather network calls. It is not a replacement for `lib/weatherSync.ts` in this phase — that file is not moved or deleted here. The relationship between the two will be resolved when weather sync is refactored into the orchestrator layer (a later phase).

## 2. Files to touch

| Action  | Path |
| ------- | ---- |
| CREATE  | `lib/orchestrator/geocode.ts` |
| CREATE  | `lib/orchestrator/weather.ts` (stub) |
| CREATE  | `lib/orchestrator/ai.ts` (stub) |
| CREATE  | `lib/__tests__/geocode.test.ts` |
| MODIFY  | `app/(tabs)/settings/page.tsx` |
| MODIFY  | `docs/ARCHITECTURE.md` §2 code map (fix stale `lib/geocode.ts` entry; introduce `lib/orchestrator/`) |
| MODIFY  | `docs/ARCHITECTURE.md` §9 invariant 3 (update path from `lib/geocode.ts` → `lib/orchestrator/geocode.ts`) |

## 3. Acceptance criteria

| # | Criterion | Level | File | Test name |
| --- | --- | --- | --- | --- |
| 1 | `searchLocations` is exported from `lib/orchestrator/geocode.ts` | unit | `geocode.test.ts` | `returns results from the open-meteo geocoding API` |
| 2 | `reverseGeocode` is exported from `lib/orchestrator/geocode.ts` | unit | `geocode.test.ts` | `returns city and state from nominatim response` |
| 3 | `GeoResult` type is exported from lib, not defined in the component | typecheck | — | `npx tsc --noEmit` passes; component imports `GeoResult` from lib |
| 4 | `searchLocations` calls the correct open-meteo URL | unit | `geocode.test.ts` | `calls the correct URL` |
| 5 | `searchLocations` returns `[]` on network error | unit | `geocode.test.ts` | `returns [] on network error` |
| 6 | `reverseGeocode` returns place name (city/town/village + state) | unit | `geocode.test.ts` | `returns city and state from nominatim response` |
| 7 | `reverseGeocode` falls back to `"lat, lon"` on network error | unit | `geocode.test.ts` | `falls back to raw coords on network error` |
| 8 | `reverseGeocode` falls back to `"lat, lon"` when no place found | unit | `geocode.test.ts` | `falls back to raw coords when no place found` |
| 9 | `app/(tabs)/settings/page.tsx` contains no direct `fetch` calls | grep | — | `grep -n 'fetch(' app/(tabs)/settings/page.tsx` returns nothing |
| 10 | `app/(tabs)/settings/page.tsx` calls `searchLocations` and `reverseGeocode` from the new module | grep | — | both names appear in the file's import and call sites |
| 11 | `weather.ts` and `ai.ts` stub files exist and the build passes | build | — | `npm run build` |

## 4. Decisions

None needed — pure refactor, no behaviour changes. No new dependencies.

## 5. Open questions

None.

## 6. Progress log

| Date | Status | Notes |
| --- | --- | --- |
| 2026-10-28 | exec plan written | awaiting approval to implement |
| 2026-10-28 | exec plan revised | addressed review: added §2 to files-to-touch, noted lib/geocode.ts non-existence, added AC-10 (import/call check), clarified weather stub scope, changed AC-3 level to typecheck |
| 2026-10-28 | implemented | PR #64 opened; all 12 geocode tests passing, typecheck clean, build green |
| 2026-10-28 | review addressed | fixed: res.ok checks, Nominatim User-Agent, count=10 assertion, merged imports; disagreed: unsafe cast (deferred to #65), stub scope (already in plan) |
| 2026-10-28 | done | PR #64 merged; exec plan archived |
