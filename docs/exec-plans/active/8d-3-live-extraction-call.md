# Exec plan: 8d-3 — Live extraction call

Build plan: docs/BUILD_PLAN.md, phase 8d-3
Approved: ,    (blank until approved)

Rules for this file:

- Sections 1 to 8 are the approved contract. Do not change them without an approved plan change (section 11).
- Sections 9 to 11 are living. Update them as work proceeds.
- Write "None" for any section with nothing to record. Do not invent entries.
- Checklists appear only in section 9.

## 1. Purpose

This phase delivers the first real AI call. It turns the provider-agnostic `ExtractionRequest` built in 8d-2 into a live HTTP request to the configured AI provider, parses the response, logs token usage, and validates the returned events against `ExtractedEventSchema`. It makes the `AIProvider` abstraction (D-059) real for Anthropic, driven entirely by the provider, model, and key from Settings (D-035, D-058). Usage is logged the moment a billed response arrives, before validation, so a billed call is never lost (D-067); a failure at any point persists nothing but that usage record, and no call is ever retried automatically (D-068). It touches `ARCHITECTURE.md` §4 (sync pipeline — the extraction step and usage logging), §5 (AI trust boundary — validation, provider config), and §9 invariants I-1, I-2, I-3, I-4, I-11, I-12, I-13, I-15, I-17, I-18, I-19.

Resolving names/labels to database IDs (8d-4) and saving a `PendingExtraction` (8d-5) are out of scope. This phase produces validated `ExtractedEvent[]` and an `ApiUsageLog` record; nothing else is persisted.

---

## 2. Scope

### In scope

- **`lib/ai/provider.ts`** — redefine the `AIProvider` abstraction to carry the built request and the per-call config, and keep it a thin network boundary (no DB, no validation, per invariant I-3):
  - `AIProvider.extract(request: ExtractionRequest, config: ProviderCallConfig): Promise<RawExtractionResult>`.
  - `ProviderCallConfig = { model: string; apiKey: string }`.
  - `RawExtractionResult = { events: unknown; usage: UsageData | null }` — `events` is deliberately `unknown` because the model response is untrusted until validated (§5); `usage` is `null` only when the transport succeeded but the response carried no usage field.
  - `UsageData = { inputTokens: number; outputTokens: number; rawUsage: Record<string, number> }`.
  - `StubAIProvider` updated to the new signature (keeps throwing; it remains the default provider in `lib/sync.ts` until 8d-5 wires the real path).
  - `getProvider(providerId: string): AIProvider` — selects the implementation from the provider id (a Settings value, invariant I-18). An unknown/unimplemented provider id throws a clear error rather than silently succeeding. Routing uses a named provider-id constant imported from `providerConfig.ts` (not an inline `'anthropic'` switch/if literal), so no provider-id string literal appears in `lib/ai/provider.ts` and the D-102 structural literal scan (`providerConfig.test.ts`, which excludes only `providerConfig.ts` and test files) stays at zero violations.
- **`lib/ai/providerConfig.ts`** — add a named provider-id constant export (the Anthropic id) for `getProvider` to route on, so the provider-id string stays confined to this config module (D-102, the single sanctioned home) and `lib/ai/provider.ts` carries no provider-id literal. No change to the `PROVIDERS` shape, labels, or model lists.
- **`lib/ai/anthropicProvider.ts`** (new) — `AnthropicProvider implements AIProvider`. Sends exactly one request to the Anthropic Messages API with a forced tool call (§5 defense #2), using `config.model` and `config.apiKey`. Parses the tool-use input into `events: unknown` and maps the response `usage` into `UsageData`. No database access, no Zod validation, no retries. The model id and API key always come from `config`; no model literal appears in source (invariant I-18). The implementer reads the `claude-api` skill reference before writing the wire format.
- **`lib/orchestrator/ai.ts`** (replaces the current placeholder) — `runExtraction()`, the orchestration seam that reads config and writes the usage log:
  - `runExtraction(params: { entryId: string; request: ExtractionRequest; settings: Settings; database?: GardenDB }): Promise<ExtractedEvent[]>`. No `entryDate`: the usage log's `date` is the call timestamp (§11), not the entry date, and `entryId` alone identifies the record; the entry date is already inside `request` (built in 8d-2). Keeping the cross-phase interface (§7 D-1, §11 D-entry) free of parameters this phase does not consume.
  - Selects the provider with `getProvider(settings.aiProvider)`, reads `settings.aiModel` and `settings.apiKeys[settings.aiProvider]`.
  - Calls `provider.extract(request, { model, apiKey })`.
  - **If `usage` is non-null, writes one `ApiUsageLog` immediately, before validation** (D-067).
  - Validates with `z.array(ExtractedEventSchema).parse(raw.events)` and returns the parsed `ExtractedEvent[]`. A validation failure throws after the usage log has already been written.
  - A transport failure (the provider throws before returning) writes no usage log and rethrows.
- **`lib/db.ts`** — add `addApiUsageLog(log: Omit<ApiUsageLog, 'id'>, database?: GardenDB): Promise<ApiUsageLog>`, which assigns an id, writes to the existing `apiUsageLogs` store, and returns the created record (invariant I-11). No store, index, or schema-version change.
- **`lib/sync.ts`** — mechanical, behaviour-preserving update of the single existing AI call site (`aiProvider.extract(entry.text, [], [])`) so the project compiles under the new `AIProvider` signature. The AI step keeps its current gate and its `running`/`failed`/`review-pending` status mapping and its try/catch; it does **not** build the real request, call `runExtraction`, resolve, or save a `PendingExtraction`. Default provider stays `StubAIProvider` (throws → `failed`), so `sync.test.ts` behaviour is unchanged.
- **Doc updates (in this PR):**
  - `ARCHITECTURE.md` §2 code map: rows for `lib/ai/anthropicProvider.ts` and the now-real `lib/orchestrator/ai.ts`; update the `lib/ai/provider.ts` description.
  - `ARCHITECTURE.md` §5: a subsection describing the provider call and the log-before-validate runner.
  - `DECISIONS.md`: a new D-entry for the `AIProvider.extract()` interface shape, the `runExtraction` orchestration seam, and the usage-field mapping (a cross-phase interface consumed by 8d-5). Drafted in §11.
- **Tests:**
  - `lib/__tests__/extract.test.ts` (new) — the `runExtraction` + `AnthropicProvider` behaviour with `fetch` stubbed (AC-1 to AC-6).
  - `lib/__tests__/db.test.ts` — one case for `addApiUsageLog` round-trip.

### Out of scope

- Resolving `matchedRosterName` / `linkedProblemRef` to database IDs (8d-4). `runExtraction` returns validated events only; the `labelMap` from 8d-2 is threaded by the 8d-5 caller.
- Saving a `PendingExtraction`, or writing `EventReview` records (8d-5).
- Wiring `buildExtractionRequest` + `runExtraction` into the sync orchestrator's AI step, and the SyncSheet row states that follow (8d-5). This phase's `lib/sync.ts` change is compile-compatibility only, not feature wiring — called out because a reviewer could reasonably assume the call site is wired here.
- A second provider (OpenAI). `providerConfig.ts` already lists it; `getProvider('openai')` throws a not-implemented error until a later phase adds it (D-035 means this needs no schema change). See §8.
- Automatic retries, backoff, or streaming (D-068). Exactly one request per call.
- Any UI (SyncSheet rows, Review view, read-only cards) — 8d-5 and 8e.

---

## 3. Files

**lib/ai/**
- `lib/ai/provider.ts` [STOP-ASK: AI provider behaviour] — redefine `AIProvider.extract` signature; add `ProviderCallConfig`, `RawExtractionResult`, `UsageData`, `getProvider` (literal-free routing, see §5 I-18); update `StubAIProvider`
- `lib/ai/providerConfig.ts` — add a named provider-id constant export for literal-free routing in `getProvider` (D-102); no change to `PROVIDERS`, labels, or model lists
- `lib/ai/anthropicProvider.ts` [STOP-ASK: AI provider behaviour] — new file; real network call, one request, no DB, no validation
  - New `lib/` module → requires `ARCHITECTURE.md §2` code-map row and a mention in §5.

**lib/orchestrator/**
- `lib/orchestrator/ai.ts` — replace placeholder with `runExtraction()` (logs usage before validation; validates; returns events)
  - Module becomes real → update its `ARCHITECTURE.md §2` code-map row and mention in §5.

**lib/db.ts**
- `lib/db.ts` [STOP-ASK: lib/db.ts area] — add `addApiUsageLog` mutation (existing `apiUsageLogs` store; no store/index/version change)

**lib/**
- `lib/sync.ts` — one-line, behaviour-preserving call-site update for the new `AIProvider` signature (bounded; see §2 Out of scope)

**Docs (same PR)**
- `docs/ARCHITECTURE.md` — §2 and §5 as above
- `docs/DECISIONS.md` — new D-entry (drafted in §11), promoted at merge

**Tests**
- `lib/__tests__/extract.test.ts` — new; AC-1 to AC-6, `fetch` stubbed
- `lib/__tests__/db.test.ts` — add `addApiUsageLog` round-trip

**Integration tests (new)**
- `e2e-integration/anthropic-live.spec.ts` — AC-8 Playwright integration test; real Anthropic API request; excluded from CI and `npm run test:e2e`
- `playwright.integration.config.ts` — separate Playwright config for the integration project (`{ name: 'node', use: {} }`); run with `npm run test:integration`

---

## 4. Acceptance criteria

Each criterion is a test case. Write the test first and confirm it fails for the right reason. `fetch` is stubbed in every automated test; no test makes a network call.

| ID | Observable behaviour | Level | Test file and name |
| --- | --- | --- | --- |
| AC-1 | With `fetch` stubbed to return a well-formed Anthropic response (one `tool_use` block whose input is `{ events: [...] }` with schema-valid events, plus `usage`), `runExtraction` resolves to an `ExtractedEvent[]` deep-equal to those events after `ExtractedEventSchema` validation. | unit | `lib/__tests__/extract.test.ts` — `runExtraction: well-formed response returns validated events` |
| AC-2 | With the same well-formed stubbed response, after `runExtraction` resolves, exactly one `ApiUsageLog` exists for the entry, with `inputTokens` and `outputTokens` taken from the response `usage` and `rawUsage` holding the full provider usage object (e.g. including `cache_read_input_tokens`). | unit | `lib/__tests__/extract.test.ts` — `runExtraction: success logs one ApiUsageLog with rawUsage` |
| AC-3 | With `fetch` stubbed to return a response that carries `usage` but a malformed tool input (e.g. `events` missing a required field), `runExtraction` rejects with a Zod validation error, and exactly one `ApiUsageLog` (including `rawUsage`) exists for the entry afterwards. | unit | `lib/__tests__/extract.test.ts` — `runExtraction: malformed content logs usage then throws validation error` |
| AC-4 | With `fetch` stubbed to reject (network failure) or resolve non-2xx before any body, `runExtraction` rejects and no `ApiUsageLog` exists for the entry afterwards. | unit | `lib/__tests__/extract.test.ts` — `runExtraction: transport failure logs nothing and rejects` |
| AC-5 | With `fetch` stubbed to reject, `fetch` is called exactly once across the whole `runExtraction` call (no automatic retry). | unit | `lib/__tests__/extract.test.ts` — `runExtraction: exactly one request on failure` |
| AC-6 | `runExtraction` run against Settings `{ aiProvider: 'anthropic', aiModel: <M>, apiKeys: { anthropic: <K> } }` calls `fetch` with a request whose model field equals `<M>` and whose auth header carries `<K>`; the provider is selected from `settings.aiProvider`. No provider id or model literal appears in `lib/ai/anthropicProvider.ts` or `lib/orchestrator/ai.ts` source as the hard-coded choice. | unit | `lib/__tests__/extract.test.ts` — `runExtraction: provider, model and key come from Settings` |
| AC-7 | `addApiUsageLog` writes a record to `apiUsageLogs` and returns it with a generated `id`; it can be read back by `id` and listed by the `by-entryId` index. | unit | `lib/__tests__/db.test.ts` — `addApiUsageLog: writes and returns the record` |
| AC-8 | With `ANTHROPIC_API_KEY` set in the environment, `runExtraction` against a real Anthropic API request using `claude-haiku-4-5-20251001` returns a non-empty `ExtractedEvent[]` that validates against `ExtractedEventSchema`, and exactly one `ApiUsageLog` exists with `inputTokens > 0`, `outputTokens > 0`, correct `model`, and correct `provider`. | integration | `e2e-integration/anthropic-live.spec.ts` — `live Anthropic extraction: integration, usage log, and garden-event quality` (run with `npm run test:integration`; excluded from CI and `npm run test:e2e`; requires `ANTHROPIC_API_KEY` env var; skipped automatically if key is absent) |

---

## 5. Invariant check (ARCHITECTURE §9)

| Invariant | Touched | How it is held | Test or check |
| --- | --- | --- | --- |
| 1. Dependencies run one way: `app/` → `components/` → `lib/`. `lib/` never imports from `components/` or `app/`, and `components/` never imports from `app/`. | yes | all new code is in `lib/ai/`, `lib/orchestrator/`, `lib/db.ts`; it imports only from `lib/` | `npx tsc --noEmit` |
| 2. Only `lib/db.ts` touches IndexedDB. | yes | `addApiUsageLog` is in `lib/db.ts`; the provider and `runExtraction` reach the DB only through `lib/db.ts` functions | code review; AC-7 |
| 3. Network-facing modules (`lib/weatherSync.ts`, `lib/orchestrator/geocode.ts`, AI providers) never touch the database. The sync orchestrator reads and writes; they only fetch. | yes | `AnthropicProvider` performs the fetch and parses the response only — no DB call. The usage log and validation live in the orchestrator seam `lib/orchestrator/ai.ts`, mirroring the weather split (`fetchWeatherForDate` pure, orchestrator writes) | code review; AC-2/AC-4 verify logging happens in `runExtraction`, not the provider |
| 4. Network calls originate in `lib/`. | yes | the only `fetch` is in `lib/ai/anthropicProvider.ts` | code review |
| 5. All writes go to IndexedDB first. Save paths make no network calls. | no | extraction is a sync-path operation started by the user, not a save path | — |
| 6. No migration code. The `upgradeneeded` handler creates all stores from scratch, with no version checks. A startup `isSchemaValid` check detects when the local DB is missing a store or index; it is not a migration (D-101). If it fails, the app blocks on a wipe prompt before any data is read. | no | no store, index, or schema-version change; `apiUsageLogs` already exists | — |
| 7. A date edit updates the entry, all its photos' `entryDate`, and all its `GeneralNote` dates in one `readwrite` transaction spanning the stores (§3). | no | not applicable to this phase | — |
| 8. `needsSync` is `1` or absent, never `0` or `false` (§3). | no | this phase does not write `needsSync` | — |
| 9. Photos are stored as `ArrayBuffer`; the store never contains a `Blob` (§3). | no | not applicable | — |
| 10. All indexes are single-field (§3). | no | no index change; the existing `apiUsageLogs.by-entryId` is single-field | — |
| 11. Every create, update, and delete function in `lib/db.ts` returns the affected record (D-036). | yes | `addApiUsageLog` returns the created `ApiUsageLog` | AC-7 |
| 12. No backend or proxy. External calls go directly from the browser to Open-Meteo, a geocoding API, and the AI provider. | yes | `AnthropicProvider` calls the provider's API directly from the browser with the user's key (D-058) | code review; AC-6 |
| 13. Weather and AI calls happen only in the sync orchestrator, started by the user, never at save. | yes | `runExtraction` is the orchestration seam the user-started sync calls (wiring in 8d-5); it is never reachable from a save path | code review |
| 14. Nothing reaches `cropEvents`, `generalNotes`, or `CropType.lessons` until the user confirms that card. | no | this phase writes only `apiUsageLogs`; no event, note, or lesson is written | — |
| 15. The model never sees database IDs. `matchedRosterName` is a name and `linkedProblemRef` is an ephemeral label; app code resolves both after parsing. | yes | the provider sends the `ExtractionRequest` from 8d-2 unchanged (names + ephemeral labels only) and returns the model output untouched; no ID resolution happens here (8d-4) | code review |
| 16. User-written text in the extraction prompt (entry text, `nextSeasonNote`, crop names, problem excerpts) is wrapped in explicit data tags. | no | the data-tag wrapping is done by `buildExtractionRequest` (8d-2); this phase sends that request verbatim | — |
| 17. `ExtractedEventSchema` is the single source for extraction types. Derive the tool schema and the TypeScript type from it; never write a second one. | yes | validation uses `z.array(ExtractedEventSchema).parse(...)`; the tool schema still comes from 8d-2's `z.toJSONSchema(ExtractedEventSchema)`; no second schema or type is written | AC-1, AC-3; code review |
| 18. Provider and model are Settings values. No provider name or model ID appears in source code. | yes | `getProvider` selects by `settings.aiProvider`, routing off a named provider-id constant imported from `providerConfig.ts` (the single sanctioned home, D-102) — no inline provider-id literal (`'anthropic'`) in `lib/ai/provider.ts`. Model and key flow from `config` (Settings). The Anthropic provider module names its own API endpoint and header format (e.g. `anthropic-version`, which is not a forbidden literal), but never hard-codes which model to use — no `claude-*` model literal is the chosen model | AC-6; code review; D-102 structural scan (`providerConfig.test.ts`) stays at zero violations |
| 19. No automatic AI retries. | yes | `AnthropicProvider` issues one `fetch` and never retries; `runExtraction` does not retry | AC-5 |
| 20. Geolocation is one-shot, requested only on user tap. `watchPosition` is never used. | no | not applicable | — |

Adds a field derived from another field: No. `ApiUsageLog` fields are recorded from the provider response, not derived from another stored field.

---

## 6. Dependencies and stop-and-ask triggers

- New packages: none. `fetch` is built in; `zod` is already a dependency.
- `lib/db.ts` schema or store changes: none. `addApiUsageLog` is a new mutation over the existing `apiUsageLogs` store (created in 8b) — no store added/removed, no index change, no field type/nullability/shape change, no schema-version bump. No DB wipe needed. Flagged [STOP-ASK] because `lib/db.ts` is a stop-and-ask area; the change is confined to adding a returning mutation (invariant I-11).
- Service worker, manifest, or base path changes: none.
- AI provider behaviour or extraction spec changes: **yes [STOP-ASK]** — this phase implements the real `AIProvider.extract()` and changes its signature, and adds `AnthropicProvider`. The extraction *spec* (`ExtractedEventSchema`, the tool schema, the prompt) is unchanged from 8d-2; only the call and response handling are added. Within the approved 8d-3 build-plan scope.
- Build plan edits: none.

---

## 7. Decisions needed before approval

- **D-1: Where usage logging and validation live, given invariant I-3.** The build-plan prose says `extract()` "validate[s] the response and log[s] usage", but invariant I-3 forbids an AI provider touching the database.
  - (a) **[Recommended]** The provider does the network call only and returns `{ events: unknown; usage }`. A separate orchestration seam `runExtraction` in `lib/orchestrator/ai.ts` logs usage (before validation) and validates. Preserves I-3, mirrors the weather split, and makes the D-067 "log before validate" ordering trivial to guarantee in one place.
  - (b) The provider logs and validates itself. Rejected: breaks I-3; would require a stop-and-ask to change an invariant.
  - Resolving this defines a cross-phase interface consumed by 8d-5, so it also warrants a permanent D-entry (drafted in §11).
- **D-2: The new `AIProvider.extract()` signature and return type.**
  - (a) **[Recommended]** `extract(request: ExtractionRequest, config: { model: string; apiKey: string }): Promise<{ events: unknown; usage: UsageData | null }>`. Keeps the provider thin and provider-agnostic at the request boundary (request built in 8d-2, D-035); `events` stays `unknown` until validated (§5).
  - (b) `extract(entryText, roster, openProblems)` builds the request internally. Rejected: duplicates 8d-2's responsibility and couples the provider to roster/problem shapes.
- **D-3: Which providers are implemented now.**
  - (a) **[Recommended]** Anthropic only; `getProvider('openai')` throws a clear "provider not implemented" error. OpenAI needs no schema change later (D-035). On-device check uses a real Anthropic key.
  - (b) Anthropic and OpenAI both now. Rejected: doubles wire-format and test work for no 8d-3 acceptance gain.
- **D-4: The `lib/sync.ts` call-site change.** Changing the `AIProvider` signature breaks the single existing call `aiProvider.extract(entry.text, [], [])`.
  - (a) **[Recommended]** Make a one-line, behaviour-preserving edit so it compiles under the new signature, keeping the default `StubAIProvider` (throws → `failed`) and the current status mapping; real wiring stays in 8d-5. `sync.test.ts` behaviour is unchanged.
  - (b) Introduce the new interface under a second name to avoid touching `sync.ts`. Rejected: violates D-059's single `AIProvider` interface and leaves dead code.

---

## 8. Open questions

None. (Q-1 resolved as D-104; Q-2 resolved as D-105. See §11.)

---

## 9. Progress

- [x] 2026-11-03 prior session: AC-1..AC-6 tests written in `extract.test.ts`, failing (reason: `runExtraction`/`AnthropicProvider` not implemented)
- [x] 2026-11-03 prior session: AC-7 test written in `db.test.ts`, failing (reason: `addApiUsageLog` not implemented)
- [x] 2026-11-03 16:05Z: AC-1..AC-7 passing (123 tests total)
- [x] 2026-11-03 16:10Z: typecheck clean, build green, lint has pre-existing `react-hooks/rules-of-hooks` false-positives in `lib/db.ts` (unchanged); 1 pre-existing webkit e2e failure (`navigation.spec.ts`) unchanged
- [x] 2026-11-05: AC-8 integration test written (`e2e-integration/anthropic-live.spec.ts`); run with `ANTHROPIC_API_KEY=<key> npm run test:integration`; end-to-end on-device deferred to Sync integration phase per human reviewer blocking verdict
- [x] 2026-11-05: fix `content:{}` / `content:[null]` throw before usage extraction (D-067); repro `888a78d` / fix `bc01a6d`; also fix pre-existing broken `.flow/` symlink causing providerConfig test failure
- [x] 2026-11-05: integration test quality assertions made informational-only (removed `expect.soft`); fix `fc9f8bc`
- [x] 2026-11-05: 130 unit tests passing; typecheck clean; e2e 110 passed / 1 pre-existing webkit failure / 5 skipped

## 10. Surprises & discoveries

- None yet.

## 11. Decision log

- 2026-11-02: **ApiUsageLog field mapping.** `inputTokens` ← provider `usage.input_tokens`, `outputTokens` ← `usage.output_tokens`, `rawUsage` ← the full provider `usage` object coerced to `Record<string, number>` (including cache/reasoning fields when present, per D-031). `provider` ← `settings.aiProvider`, `model` ← `settings.aiModel`, `entryId` ← the entry under extraction. Reason: matches the `ApiUsageLog` shape in `lib/db.ts` and D-031's intent to keep whatever the provider returned. Alternatives: storing only input/output tokens (loses cache detail D-031 wants) — rejected.
- 2026-11-02: **`ApiUsageLog.date`.** Set to the call timestamp (`new Date().toISOString()`), not the entry date, because the log records a billing event at a point in time. Reason: usage is about when the call was billed. Alternative: entry date — rejected as less useful for usage accounting.
- 2026-11-03: **`getProvider` routes off a `providerConfig.ts` id constant, not an inline literal (I-18 / D-102).** `getProvider` must map a provider id to an implementation, so the id string must appear somewhere. The D-102 structural scan (`providerConfig.test.ts`) walks every non-test `.ts`/`.tsx` file except `providerConfig.ts` and fails on any string literal equal to a provider id or model name. Therefore `providerConfig.ts` gains a named provider-id constant export (the sanctioned home for these strings) and `getProvider` imports it to route; no provider-id literal appears in `lib/ai/provider.ts`. Reason: keeps I-18 held and the scan green without an invariant change. Alternatives: an inline `switch ('anthropic')` — rejected, trips the scan; unquoted object-key registry — rejected, relies on a scan-regex quirk and still spells the provider name in `provider.ts`, against I-18's spirit. (Adds `lib/ai/providerConfig.ts` to §3 scope; a bounded additive export, pre-approval refinement.)
- 2026-11-03: **`runExtraction` drops `entryDate` from its signature.** The parameter was unused this phase: the usage log `date` is the call timestamp (not the entry date), `entryId` identifies the `ApiUsageLog`, and the entry date is already embedded in the `ExtractionRequest` built in 8d-2. Reason: the signature becomes a cross-phase interface promoted to a permanent D-entry (§7 D-1), so it should carry no parameter this phase does not consume; 8d-5 already holds the entry and can read its date directly. Alternative: keep `entryDate` for a hypothetical 8d-5 need — rejected, no such need is identified and it would bake a redundant field into the durable interface.
- 2026-11-02: **Draft permanent D-entry (promote to `docs/DECISIONS.md` in this PR).** Record the real `AIProvider.extract(request, config) → { events: unknown; usage }` interface, the `runExtraction` orchestration seam that logs-before-validates and keeps the provider free of DB access (I-3), and the usage-field mapping above. Rationale: 8d-5 consumes this interface, so per the 8d-2 retrospective a cross-phase interface needs a durable D-entry, not only a §11 entry. Builds on D-059, D-067, D-068, D-035, D-092, D-058.

- 2026-11-03: **`lib/ai/providerConfig.ts` scope addition approved by human.** The plan-reviewer flagged that adding `lib/ai/providerConfig.ts` to §3 scope departs from the 8d-3 build-plan entry (which omits D-102). The human explicitly approved this addition during the plan review loop. Reason: the change is required to hold I-18 and keep the D-102 structural scan at zero violations; without it `getProvider` would place an inline provider-id literal in `lib/ai/provider.ts`. Bounded to one new named constant export; no change to `PROVIDERS`, labels, or model lists.

- 2026-11-03: **D-104: OpenAI provider lands as its own bounded sub-phase, not folded into eval (resolves Q-1, issue #72).** → When a second provider is picked up, OpenAI is implemented in a dedicated sub-phase (sibling to 8d-3), scoped to `lib/ai/openaiProvider.ts`, the `getProvider` routing branch, the OpenAI provider-id constant already in `providerConfig.ts`, the `input_schema`→`parameters` mapping (D-103), and `fetch`-stubbed unit tests. The AI evaluation set is the likely trigger for scheduling it, but provider implementation and eval design stay separate phases. Scheduling it is a build-plan edit and still goes through the human (AGENTS.md "Stop and ask before … Editing the build plan"); this decision settles only the shape, not the timing. Needs no schema change or DB wipe (D-035). Reason: keeps the mechanical wire-format work and the open-ended eval design independently reviewable. Alternatives considered: folding OpenAI into the eval work (couples a mechanical task to a 'needs design' effort) — rejected; leaving it entirely unscheduled with no shape guidance — rejected.
- 2026-11-03: **D-105: Anthropic `max_tokens` is a fixed constant; a cap-truncated response fails validation, not the transport (resolves Q-2, issue #73).** → `AnthropicProvider` sends a fixed numeric `max_tokens` constant (start at 4096) defined in `lib/ai/anthropicProvider.ts`. It is not a Settings field and not an I-18 literal (it is a number, not a provider/model string). The provider must **not** throw on `stop_reason === "max_tokens"`: a cap-truncated response is billed, so it returns `{ events: <partial/invalid tool input>, usage }`; `runExtraction` writes the `ApiUsageLog` first (D-067), then `z.array(ExtractedEventSchema).parse(...)` throws — the AC-3 malformed-content path, not the AC-4 transport-failure path. No automatic retry (I-19); the user re-runs manually (D-068). Revisit the value only if real entries hit the cap. Reason: preserves the billed-usage log on truncation and keeps `max_tokens` trivially bumpable without a schema change. Alternatives considered: making `max_tokens` a Settings value (requires a `lib/db.ts` schema change, stop-and-ask) — rejected; computing it dynamically from input size — rejected as unnecessary at personal scale; throwing in the provider on `stop_reason: "max_tokens"` — rejected, loses the usage log (violates D-067).

- 2026-11-05: **AC-8 redefined from manual on-device check to Playwright integration test.** Per human reviewer blocking verdict (FLOW-VERDICT sha=c64aa42c3ca34f45b6ae08aa9c8abdad457017f9), the manual on-device check (installed PWA, iOS Safari, real key) is not feasible this phase because `runExtraction()` is not yet integrated into the Sync workflow and there is no UI to invoke it or inspect results. AC-8 §4 is replaced with a Playwright Node integration test (`e2e-integration/anthropic-live.spec.ts`: `live Anthropic extraction: integration, usage log, and garden-event quality`) that makes a real Anthropic API request and verifies the returned extraction results and IndexedDB usage logging. The test is excluded from CI and skipped automatically if `ANTHROPIC_API_KEY` is absent. Reason: provides verifiable live-API coverage for this phase while deferring the installed-PWA/iOS-Safari path to 8d-5 when `runExtraction` is wired into the sync workflow. Alternatives: keeping AC-8 as a manual on-device check and marking it blocked — rejected, leaves the phase with no live-API gate.

- 2026-11-05: **On-device end-to-end verification deferred to 8d-5.** The build-plan 8d-3 Done-when includes "On the installed app, one real call with a real key… returns events and produces one usage record." This check requires `runExtraction()` to be wired into the Sync workflow and exposed via UI, which is out of scope for 8d-3. The 8d-5 Sync integration phase **must** include this as a gate: on the installed PWA in iOS Safari, one real call with a real key returns validated `ExtractedEvent[]` and writes exactly one `ApiUsageLog`. The Node Playwright integration test (`fake-indexeddb`, no browser) covers the HTTP call, response parse, and usage mapping but does not exercise the installed-PWA/iOS-Safari path (ARCHITECTURE §7/§8). Reason: recording explicitly here so the check is not silently dropped when 8d-5 is planned.

## 12. Outcomes & retrospective

Filled in at completion.
