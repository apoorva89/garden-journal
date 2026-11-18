# Exec plan: 8d-3b — OpenAI provider

Build plan: docs/BUILD_PLAN.md, phase 8d-3b
Approved: ,    (blank until approved)

Rules for this file:

- Sections 1 to 8 are the approved contract. Do not change them without an approved plan change (section 11).
- Sections 9 to 11 are living. Update them as work proceeds.
- Write "None" for any section with nothing to record. Do not invent entries.
- Checklists appear only in section 9.

## 1. Purpose

This phase adds the OpenAI implementation of the `AIProvider.extract()` interface defined in 8d-3 (D-106), so a user who sets `aiProvider` to `openai` in Settings gets a real extraction instead of a "not implemented" error. It is a bounded, mechanical wire-format translation: the provider-agnostic `ExtractionRequest` from 8d-2 is rendered into the OpenAI Chat Completions request, mapping the tool definition's `input_schema` field to OpenAI's `parameters` (D-103), and OpenAI's usage fields are mapped into the existing `UsageData` shape. No schema change, no DB wipe, no new Settings fields (D-035). It touches `ARCHITECTURE.md` §5 (AI trust boundary — the provider call layer) and §2 (code map). The §9 invariants it must hold are I-1, I-3, I-4, I-12, I-13, I-15, I-16, I-17, I-18, I-19.

The orchestration seam (`runExtraction` in `lib/orchestrator/ai.ts`) is already provider-agnostic — it selects the provider with `getProvider(settings.aiProvider)` and logs usage before validation (D-067). This phase changes nothing there; it only adds a second implementation behind the existing factory. Request building (8d-2), resolution (8d-4), saving a `PendingExtraction` (8d-5), and the AI evaluation set are out of scope.

---

## 2. Scope

### In scope

- **`lib/ai/openaiProvider.ts`** (new) — `OpenAIProvider implements AIProvider`. Sends exactly one request to the OpenAI Chat Completions API with a forced function (tool) call (§5 defense #2), using `config.model` and `config.apiKey`. Translation from the provider-agnostic `ExtractionRequest`:
  - `request.system` → a `{ role: 'system', content }` message (OpenAI carries the system prompt as a message, not a top-level field).
  - `request.userMessage` → a `{ role: 'user', content }` message.
  - `request.tool` → `tools: [{ type: 'function', function: { name, description, parameters } }]`, where `parameters` is `request.tool.input_schema` **verbatim** — the `input_schema` → `parameters` rename and nothing else (D-103).
  - Force the tool call with `tool_choice: { type: 'function', function: { name: request.tool.name } }`.
  - Auth via the `Authorization: Bearer <config.apiKey>` header. No proxy (I-12).
  - Parse `choices[0].message.tool_calls[0].function.arguments` — which OpenAI returns as a **JSON string** — into `events: unknown`. The string is `JSON.parse`d inside a guard so a malformed/absent arguments string yields `events: undefined` and **never throws before `usage` is returned** (D-067; see §11 D-1). This mirrors `AnthropicProvider` returning `events: undefined` when no tool block is present.
  - Map usage: `inputTokens` ← `usage.prompt_tokens`, `outputTokens` ← `usage.completion_tokens`, `rawUsage` ← the top-level numeric fields of `usage` (`prompt_tokens`, `completion_tokens`, `total_tokens`) plus `cache_read_input_tokens` ← `usage.prompt_tokens_details?.cached_tokens` (when present), for parity with Anthropic’s stored cache field (D-031; §11 D-5). All other object-valued entries (`prompt_tokens_details`, `completion_tokens_details`) are dropped so the `Record<string, number>` contract is preserved with no field-shape change. `usage` is `null` only when the response carried no usage field.
  - No database access, no Zod validation, no retries (I-3, I-19). The model id and API key always come from `config`; no model or provider-id string literal appears in the source (I-18).
- **`lib/ai/provider.ts`** — add one routing branch to `getProvider`: when `providerId === PROVIDER_ID_OPENAI`, return a new `OpenAIProvider`. Routing uses a named constant imported from `providerConfig.ts` (the D-102 sanctioned home), so no `'openai'` string literal appears in this file. The unknown-provider throw path is unchanged.
- **`lib/ai/providerConfig.ts`** — add a named `PROVIDER_ID_OPENAI` constant export for `getProvider` to route on (the D-104 text assumed this constant already existed; only `PROVIDER_ID_ANTHROPIC` does). Additive only: no change to the `PROVIDERS` shape, labels, or model lists.
- **Doc updates (in this PR):**
  - `ARCHITECTURE.md` §2 code map: a row for `lib/ai/openaiProvider.ts`; update the `lib/ai/provider.ts` row to note `getProvider` now routes to Anthropic or OpenAI.
  - `ARCHITECTURE.md` §5: a note in the provider-call subsection that `getProvider` selects Anthropic or OpenAI and that each provider owns its wire-format translation (OpenAI maps `input_schema` → `parameters`, D-103).
  - `DECISIONS.md`: update D-104 `Status` from `Planned, not built` to `Current`, and add a D-entry for the OpenAI wire-format translation and the "tool arguments are a JSON string; parse without losing the usage log" rule (drafted in §11).
- **Tests:**
  - `lib/__tests__/openaiExtract.test.ts` (new) — the OpenAI wire format + `runExtraction` behaviour with `fetch` stubbed (AC-2 to AC-9).
  - `lib/__tests__/anthropicExtract.test.ts` (renamed from `extract.test.ts`) — update the existing `getProvider('openai')` case from "throws not implemented" to "returns an `OpenAIProvider`" (AC-1). Rename for symmetry with `openaiExtract.test.ts` (§11 D-2); no content change beyond the routing update.
  - `e2e-integration/openai-live.spec.ts` (new) — the live-call integration test (AC-11), excluded from CI, skipped when `OPENAI_API_KEY` is absent.

### Out of scope

- Any change to `lib/orchestrator/ai.ts` (`runExtraction`). It is already provider-agnostic; adding a second provider requires no change there. Called out because a reviewer could reasonably expect the runner to change.
- Request building (`buildExtractionRequest`, 8d-2), event resolution (8d-4), saving a `PendingExtraction` or `EventReview` records (8d-5), and any UI (SyncSheet rows, Review view). The OpenAI provider returns `{ events: unknown; usage }` only; everything downstream already handles it provider-agnostically.
- Wiring the real extraction path into `lib/sync.ts` (8d-5). `lib/sync.ts` is not touched this phase.
- The AI evaluation set (Eval set phase, D-104).
- Any schema, store, index, Settings field, or model-list change (D-035). The OpenAI models already listed in `PROVIDERS` are not altered.
- Automatic retries, backoff, or streaming (D-068). Exactly one request per call.
- OpenAI "strict" structured-output mode / `additionalProperties` tuning of the tool schema. The tool schema is sent as derived in 8d-2 (`input_schema` verbatim as `parameters`); if a real OpenAI call rejects that schema shape, it is recorded in §10 and raised rather than fixed by widening scope.

---

## 3. Files

**lib/ai/**
- `lib/ai/openaiProvider.ts` [STOP-ASK: AI provider behaviour] — new file; one OpenAI Chat Completions request, `input_schema` → `parameters`, usage mapping, no DB, no validation, no retries.
  - New `lib/` module → requires an `ARCHITECTURE.md §2` code-map row and a mention in §5.
- `lib/ai/provider.ts` [STOP-ASK: AI provider behaviour] — add the `PROVIDER_ID_OPENAI` routing branch to `getProvider`; literal-free (imports the constant, I-18 / D-102).
- `lib/ai/providerConfig.ts` — add the `PROVIDER_ID_OPENAI` named constant export (sanctioned literal home, D-102). No change to `PROVIDERS`, labels, or model lists.

**Docs (same PR)**
- `docs/ARCHITECTURE.md` — §2 code-map row for `openaiProvider.ts`; §2/§5 note that `getProvider` routes to Anthropic or OpenAI.
- `docs/DECISIONS.md` — D-104 `Status` → `Current`; new D-entry (drafted in §11), promoted at merge. Also annotate D-031 and D-106 to note that for the OpenAI provider, reasoning-token details (`completion_tokens_details`) are not stored and cache data is mapped via the targeted scheme in D-5; this supersedes the "full provider usage object" language for OpenAI.
- `docs/BUILD_PLAN.md` [STOP-ASK: build plan edit] — end-of-run status-line flip for 8d-3b (`Not started` → `Done`), performed by the flow workflow with human approval; no scope or content change (§6).

**Tests**
- `lib/__tests__/openaiExtract.test.ts` — new; AC-2 to AC-9, `fetch` stubbed.
- `lib/__tests__/anthropicExtract.test.ts` [STOP-ASK: confirmed scope addition — §11 D-2] (renamed from `extract.test.ts`) — update the `getProvider('openai')` case (AC-1).

**Integration tests**
- `e2e-integration/openai-live.spec.ts` — new; AC-11; real OpenAI request; excluded from CI and `npm run test:e2e`; run with the existing `npm run test:integration` (its config's `testDir: ./e2e-integration` picks the file up automatically — no config or `package.json` change).

**Not touched (named to bound the diff):** `lib/orchestrator/ai.ts`, `lib/db.ts`, `lib/sync.ts`, `lib/ai/extractionSpec.ts`, `lib/ai/requestBuilder.ts`, `lib/ai/anthropicProvider.ts`, `lib/__tests__/providerConfig.test.ts` (its structural scan walks all source files automatically; verify during implementation that the new files contribute zero literal violations), `playwright.integration.config.ts`, `package.json`.

---

## 4. Acceptance criteria

Each criterion is a test case. Write the test first and confirm it fails for the right reason. Exception: AC-10 reuses an existing structural scan that already passes before the new files exist — it is not a red-green criterion. The §9 progress checklist records it as a separate "verify-passes" step, not a failing-test step. AC-1 to AC-9 are automated unit tests; `fetch` is stubbed in every one and none makes a network call. The structural scan in `providerConfig.test.ts` (§3) is not a new test case — it already passes before implementation and is not an acceptance criterion. AC-11 is the one exception: the live **integration** test (run with `npm run test:integration`, excluded from CI, skipped when `OPENAI_API_KEY` is absent), which makes exactly one real request. The `integration` level is this repo's established category for live external-API tests — `playwright.integration.config.ts` and `e2e-integration/` already exist and hold `anthropic-live.spec.ts` — extending the template's `unit`/`e2e`/`manual` set; see §11 D-6.

| ID | Observable behaviour | Level | Test file and name |
| --- | --- | --- | --- |
| AC-1 | `getProvider('openai')` returns an instance of `OpenAIProvider` and no longer throws. The existing `getProvider('unknown-provider-id')` throw test in the same file is unchanged and continues to cover the unknown-provider path. | unit | `lib/__tests__/anthropicExtract.test.ts` — `getProvider: returns an OpenAIProvider for openai` |
| AC-2 | With `fetch` stubbed to return a well-formed OpenAI response (one `tool_calls` entry whose `function.arguments` is the JSON string `{"events":[...]}` with schema-valid events, plus `usage`) and Settings `aiProvider: 'openai'`, `runExtraction` resolves to an `ExtractedEvent[]` deep-equal to those events after `ExtractedEventSchema` validation. `fetch` is called exactly once. | unit | `lib/__tests__/openaiExtract.test.ts` — `well-formed OpenAI response returns validated events` |
| AC-3 | With the same well-formed stubbed response, after `runExtraction` resolves, exactly one `ApiUsageLog` exists for the entry, with `inputTokens` ← `prompt_tokens`, `outputTokens` ← `completion_tokens`, and `rawUsage` holding the mapped usage fields (`prompt_tokens`, `completion_tokens`, `total_tokens` as top-level numerics, plus `cache_read_input_tokens` from `prompt_tokens_details.cached_tokens` when present) while every `rawUsage` value is a number — `prompt_tokens_details.cached_tokens` is stored as `cache_read_input_tokens` for parity with Anthropic’s stored cache field; other object-valued entries are dropped so the `Record<string, number>` contract holds (§11 D-5). `fetch` is called exactly once. | unit | `lib/__tests__/openaiExtract.test.ts` — `success logs one ApiUsageLog with mapped OpenAI usage, cache parity field, and numeric-only rawUsage values` |
| AC-4 | `runExtraction` against Settings `{ aiProvider: 'openai', aiModel: <M>, apiKeys: { openai: <K> } }` calls `fetch` with the OpenAI Chat Completions URL (`https://api.openai.com/v1/chat/completions`), method `POST`, a `Content-Type: application/json` header, and an `Authorization` header of `Bearer <K>`. The request body's `model` equals `<M>`; its `messages` carry the system prompt as a `role:'system'` message whose `content` is **exactly equal** to `request.system` and the user message as a `role:'user'` message whose `content` is **exactly equal** to `request.userMessage` (verbatim, no re-wrapping — I-16); its `tools[0].function.name` equals `request.tool.name`, `tools[0].function.description` equals `request.tool.description`, and `tools[0].function.parameters` deep-equals `request.tool.input_schema` (the `input_schema` → `parameters` rename, no other change); and its `tool_choice` forces that function. No additional request headers are present in the fetch call beyond `Authorization: Bearer <K>` and `Content-Type: application/json` (no opt-in header, no proxy header — I-12). | unit | `lib/__tests__/openaiExtract.test.ts` — `sends OpenAI wire format: URL, method, required-only headers, verbatim messages, renamed parameters, forced tool, model and key from Settings` |
| AC-5 | With `fetch` stubbed to return a 200 carrying `usage` but `function.arguments` whose parsed `events` are schema-invalid (e.g. a bad `eventType`), `runExtraction` rejects with a Zod validation error, and exactly one `ApiUsageLog` (including `rawUsage`) exists for the entry afterwards. `fetch` is called exactly once. | unit | `lib/__tests__/openaiExtract.test.ts` — `schema-invalid events log usage then throw validation error` |
| AC-6 | With `fetch` stubbed to return a 200 carrying `usage` but `function.arguments` that is not valid JSON (unparseable), or with no `tool_calls` at all, `runExtraction` rejects with a Zod validation error and exactly one `ApiUsageLog` exists for the entry afterwards (the provider does not throw before `usage` is returned — D-067). `fetch` is called exactly once. | unit | `lib/__tests__/openaiExtract.test.ts` — `unparseable or missing tool arguments log usage then throw` |
| AC-7 | With `fetch` stubbed to reject (network failure) before any response, `runExtraction` rejects and no `ApiUsageLog` exists for the entry afterwards. | unit | `lib/__tests__/openaiExtract.test.ts` — `transport failure logs nothing and rejects` |
| AC-8 | With `fetch` stubbed to resolve non-2xx (e.g. 401) before any body, `runExtraction` rejects with an error carrying the status and no `ApiUsageLog` exists for the entry afterwards. `fetch` is called exactly once. | unit | `lib/__tests__/openaiExtract.test.ts` — `non-2xx response logs nothing and rejects` |
| AC-9 | With `fetch` stubbed to reject, `fetch` is called exactly once across the whole `runExtraction` call (no automatic retry). | unit | `lib/__tests__/openaiExtract.test.ts` — `exactly one request on failure` |
| AC-12 | With `fetch` stubbed to return a well-formed response (valid `tool_calls` with schema-valid `function.arguments`) but no `usage` field in the response body, `runExtraction` resolves to the validated events and no `ApiUsageLog` is written for the entry afterwards. `fetch` is called exactly once. | unit | `lib/__tests__/openaiExtract.test.ts` — `no usage field returns events without writing a usage log` |
| AC-11 | With `OPENAI_API_KEY` set, `runExtraction` against a real OpenAI request — the `ExtractionRequest` built by the production `buildExtractionRequest()` (8d-2) from a sample entry, so the live call exercises the real derived tool schema, not a handwritten fixture (§8 Q-1) — using `gpt-4o-mini` returns a non-empty `ExtractedEvent[]` that validates against `ExtractedEventSchema`; a counting wrapper around the real `fetch` records **exactly one** invocation (one real request, no retry — satisfying the build plan's "sends one real request"); and exactly one `ApiUsageLog` exists with `inputTokens > 0`, `outputTokens > 0`, correct `model`, and `provider: 'openai'`. | integration | `e2e-integration/openai-live.spec.ts` — `live OpenAI extraction: one real request, validated events, one usage log` (run with `npm run test:integration`; excluded from CI and `npm run test:e2e`; requires `OPENAI_API_KEY`; skipped automatically if the key is absent) |

---

## 5. Invariant check (ARCHITECTURE §9)

| Invariant | Touched | How it is held | Test or check |
| --- | --- | --- | --- |
| 1. Dependencies run one way: `app/` → `components/` → `lib/`. `lib/` never imports from `components/` or `app/`, and `components/` never imports from `app/`. | yes | all new code is in `lib/ai/`; it imports only from `lib/` | `grep -rn "from '.*components/\|from '.*app/" lib/ --include="*.ts"` returns zero results for the new files; code review |
| 2. Only `lib/db.ts` touches IndexedDB. | no | the OpenAI provider makes no DB call; usage logging stays in `runExtraction` (unchanged) via `addApiUsageLog` in `lib/db.ts` | — |
| 3. Network-facing modules (`lib/weatherSync.ts`, `lib/orchestrator/geocode.ts`, AI providers) never touch the database. The sync orchestrator reads and writes; they only fetch. | yes | `OpenAIProvider` performs the fetch and parses the response only — no DB call, no validation. The usage log and validation stay in `lib/orchestrator/ai.ts` | code review (primary — confirms `OpenAIProvider` has no `lib/db.ts` import); AC-3/AC-5/AC-6 as supporting evidence (verify usage records exist after the runner completes, consistent with the provider having no DB access) |
| 4. Network calls originate in `lib/`. | yes | the only new `fetch` is in `lib/ai/openaiProvider.ts` | code review |
| 5. All writes go to IndexedDB first. Save paths make no network calls. | no | extraction is a sync-path operation started by the user, not a save path | — |
| 6. No migration code. The `upgradeneeded` handler creates all stores from scratch, with no version checks. A startup `isSchemaValid` check detects when the local DB is missing a store or index; it is not a migration (D-101). If it fails, the app blocks on a wipe prompt before any data is read. | no | no store, index, or schema-version change | — |
| 7. A date edit updates the entry, all its photos' `entryDate`, and all its `GeneralNote` dates in one `readwrite` transaction spanning the stores (§3). | no | not applicable | — |
| 8. `needsSync` is `1` or absent, never `0` or `false` (§3). | no | this phase does not write `needsSync` | — |
| 9. Photos are stored as `ArrayBuffer`; the store never contains a `Blob` (§3). | no | not applicable | — |
| 10. All indexes are single-field (§3). | no | no index change | — |
| 11. Every create, update, and delete function in `lib/db.ts` returns the affected record (D-036). | no | no new or changed `lib/db.ts` function; `addApiUsageLog` is reused unchanged | — |
| 12. No backend or proxy. External calls go directly from the browser to Open-Meteo, a geocoding API, and the AI provider. | yes | `OpenAIProvider` calls `https://api.openai.com/v1/chat/completions` directly with the user's key (D-058), sending only `Authorization: Bearer` and `Content-Type: application/json` — no proxy, no special opt-in header (see §11 D-3) | code review; AC-4 (direct endpoint, Bearer auth, no proxy/extra header). Browser-origin CORS is **not** established by AC-11 — it runs in Node, not a browser origin — and is confirmed instead by the 8d-5 on-device manual check (§8 Q-2) |
| 13. Weather and AI calls happen only in the sync orchestrator, started by the user, never at save. | yes | `OpenAIProvider` is reached only through `runExtraction`, the user-started orchestration seam (wiring in 8d-5); it is never reachable from a save path | code review |
| 14. Nothing reaches `cropEvents`, `generalNotes`, or `CropType.lessons` until the user confirms that card. | no | this phase writes only `apiUsageLogs` (via the unchanged runner); no event, note, or lesson is written | — |
| 15. The model never sees database IDs. `matchedRosterName` is a name and `linkedProblemRef` is an ephemeral label; app code resolves both after parsing. | yes | the provider sends the `ExtractionRequest` from 8d-2 unchanged (names + ephemeral labels only) and returns the model output untouched; no ID resolution happens here (8d-4) | code review; AC-4 (body carries the request verbatim) |
| 16. User-written text in the extraction prompt (entry text, `nextSeasonNote`, crop names, problem excerpts) is wrapped in explicit data tags. | yes | the data-tag wrapping itself is done by `buildExtractionRequest` (8d-2); the new adapter constructs the messages that carry that tagged content, so it must copy `request.system` and `request.userMessage` into the message `content` fields **verbatim** — never modifying, re-wrapping, or re-tagging the already-tagged text | AC-4 (system/user `content` exactly equal to the request); code review |
| 17. `ExtractedEventSchema` is the single source for extraction types. Derive the tool schema and the TypeScript type from it; never write a second one. | yes | validation stays `z.array(ExtractedEventSchema).parse(...)` in the runner; the tool `parameters` is `request.tool.input_schema` (itself derived from `ExtractedEventSchema` in 8d-2) sent verbatim; no second schema or type is written | AC-2, AC-4, AC-5; code review |
| 18. Provider and model are Settings values. No provider name or model ID appears in source code. | yes | `getProvider` routes off the `PROVIDER_ID_OPENAI` constant imported from `providerConfig.ts` (the single sanctioned home, D-102) — no `'openai'` literal in `lib/ai/provider.ts`. Model and key flow from `config` (Settings). `openaiProvider.ts` names its own API endpoint and `Bearer` auth format (not forbidden literals) but hard-codes no model or provider-id string | AC-10; code review; D-102 structural scan stays at zero violations |
| 19. No automatic AI retries. | yes | `OpenAIProvider` issues one `fetch` and never retries; `runExtraction` does not retry | AC-9 |
| 20. Geolocation is one-shot, requested only on user tap. `watchPosition` is never used. | no | not applicable | — |

Adds a field derived from another field: No. `ApiUsageLog` fields are recorded from the provider response by the unchanged runner, not derived from another stored field.

---

## 6. Dependencies and stop-and-ask triggers

- New packages: none. `fetch` is built in; `zod` and `idb` are already dependencies.
- `lib/db.ts` schema or store changes: none. No store, index, field, or schema-version change; no DB wipe needed (D-035). `ApiUsageLog.rawUsage` keeps its existing `Record<string, number>` type — the provider stores top-level numeric fields (`prompt_tokens`, `completion_tokens`, `total_tokens`) and maps `prompt_tokens_details?.cached_tokens → cache_read_input_tokens`; other object-valued entries are dropped so the field holds only numbers with no field-shape change (§11 D-5). Called out explicitly because a naïve `as Record<string, number>` cast would otherwise let OpenAI's nested object values slip past the type.
- Service worker, manifest, or base path changes: none.
- AI provider behaviour or extraction spec changes: **yes [STOP-ASK]** — this phase adds a second `AIProvider` implementation (`OpenAIProvider`) and a `getProvider` routing branch. The extraction *spec* (`ExtractedEventSchema`, the tool schema, the prompt, the request shape) is unchanged from 8d-2; only a new wire-format translation and response parse are added. Within the approved 8d-3b build-plan scope and D-104.
- Test file rename: **yes [STOP-ASK: confirmed scope addition — §11 D-2]** — `lib/__tests__/extract.test.ts` renamed to `lib/__tests__/anthropicExtract.test.ts` for symmetry with the new `openaiExtract.test.ts`. Not covered by the build-plan scope; confirmed by human before implementation (§11 D-2).
- Build plan edits: **yes [STOP-ASK]** — one status-line flip for 8d-3b (`Not started` → `Done`) at end-of-run, performed by the normal flow workflow with human approval (listed in §3). No scope, content, or ordering change; D-104 already scheduled this sub-phase. Flagged here because `AGENTS.md` requires approval before any build-plan edit, even a status flip.

---

## 7. Decisions needed before approval

None. All six decisions (D-1 to D-6) were reviewed and resolved. See §11 for the resolved entries.

---

## 8. Open questions

None.

---

## 9. Progress

The original red/green entries below expand the implementation progress record. Commit `3839d3a` contains the tests and implementation together, so Git history cannot independently verify their order.

- [x] 2026-11-18 17:55Z: AC-1 written before implementation. The factory rejected OpenAI before the test could reach the new behavior.
- [x] 2026-11-18 17:55Z: AC-1 passed after adapter and factory routing implementation.
- [x] 2026-11-18 17:55Z: AC-2 written before implementation. The factory rejected OpenAI before the test could reach the new behavior.
- [x] 2026-11-18 17:55Z: AC-2 passed after adapter and factory routing implementation.
- [x] 2026-11-18 17:55Z: AC-3 written before implementation. The factory rejected OpenAI before the test could reach the new behavior.
- [x] 2026-11-18 17:55Z: AC-3 passed after adapter and factory routing implementation.
- [x] 2026-11-18 17:55Z: AC-4 written before implementation. The factory rejected OpenAI before the test could reach the new behavior.
- [x] 2026-11-18 17:55Z: AC-4 passed after adapter and factory routing implementation.
- [x] 2026-11-18 17:55Z: AC-5 written before implementation. The factory rejected OpenAI before the test could reach the new behavior.
- [x] 2026-11-18 17:55Z: AC-5 passed after adapter and factory routing implementation.
- [x] 2026-11-18 17:55Z: AC-6 written before implementation. The factory rejected OpenAI before the test could reach the new behavior.
- [x] 2026-11-18 17:55Z: AC-6 passed after adapter and factory routing implementation.
- [x] 2026-11-18 17:55Z: AC-7 written before implementation. The factory rejected OpenAI before the test could reach the new behavior.
- [x] 2026-11-18 17:55Z: AC-7 passed after adapter and factory routing implementation.
- [x] 2026-11-18 17:55Z: AC-8 written before implementation. The factory rejected OpenAI before the test could reach the new behavior.
- [x] 2026-11-18 17:55Z: AC-8 passed after adapter and factory routing implementation.
- [x] 2026-11-18 17:55Z: AC-9 written before implementation. The factory rejected OpenAI before the test could reach the new behavior.
- [x] 2026-11-18 17:55Z: AC-9 passed after adapter and factory routing implementation.
- [x] 2026-11-18 17:55Z: AC-12 written before implementation. The factory rejected OpenAI before the test could reach the new behavior.
- [x] 2026-11-18 17:55Z: AC-12 passed after adapter and factory routing implementation.
- [x] 2026-11-18 17:55Z: AC-10 passed the existing structural scan with zero forbidden provider/model literals.
- [x] 2026-11-18 17:56Z: Lint, standalone typecheck, Next.js static export, and service worker build passed.
- [x] 2026-11-18 18:55Z: Review follow-up expanded AC-11 with an informational event-quality table and raw-usage assertions. The unit suite also verifies that a present but empty usage object logs one record with zero token counts and empty raw usage. All 150 Vitest tests passed.
- [ ] 2026-11-18 18:55Z: AC-11 real API verification pending. Playwright discovered the expanded spec and skipped it because `OPENAI_API_KEY` was absent.
- [x] 2026-11-18: Reviewer A (round 1) reviewed sha `3839d3a` — FLOW-VERDICT APPROVED. Non-blocking: TDD ordering unverifiable from squashed commit; §9 less granular than template format; `mapUsage` empty-object edge case untested.
- [x] 2026-11-18: Reviewer B (round 1) reviewed sha `3839d3a` — FLOW-VERDICT BLOCKING. Blocking: `scripts/flow/providers.mjs` and `tests/flow/providers.test.mjs` present in diff but absent from plan §3. Non-blocking: `BUILD_PLAN.md` content addition exceeds described change; D-109 status not promoted; AC-11 skipped.
- [x] 2026-11-18: Human reviewer (round 1) reviewed sha `3839d3a` — FLOW-VERDICT BLOCKING. Blocking: `openai-live.spec.ts` too thin compared to `anthropic-live.spec.ts`. Non-blocking: browser-origin CORS deferred to 8d-5.
- [x] 2026-11-18 18:55Z: Fix round. Reviewer B blocking-1 closed by confirming `origin/main` already contained PR #91 (`4b27763`) — no code change needed. Human B-1 resolved by expanding `openai-live.spec.ts` (commit `d58f020`). Reviewer A NB-1/2 resolved by expanding §9 (commit `c2a0da5`). Reviewer A NB-3 resolved by adding empty-usage unit test (commit `d58f020`).
- [x] 2026-11-18: AC-11 live integration run verified by human with real `OPENAI_API_KEY` (gpt-4o-mini). All 12 quality checks passed; one `ApiUsageLog` recorded with `inputTokens > 0`, `outputTokens > 0`, and `rawUsage` fields present.
- [x] 2026-11-18: Reviewer A (round 2) reviewed sha `c2a0da5` — FLOW-VERDICT APPROVED. Non-blocking: TDD ordering still unverifiable; AC-11 unrun at review time (subsequently verified by human); added coverage sound.
- [x] 2026-11-18: Reviewer B (round 2) reviewed sha `c2a0da5` — FLOW-VERDICT APPROVED. Previous blocking finding resolved by base-branch alignment. Non-blocking: §3 `BUILD_PLAN.md` description inaccurate (§§1–8 are approved contract); D-109 promotion pending merge; AC-11 still needs live run.
- [x] 2026-11-18: Human reviewer approved sha `c2a0da5` — FLOW-VERDICT APPROVED. Phase complete pending D-109 promotion at merge.

## 10. Surprises & discoveries

- 2026-11-18 09:56 PST — AC-11 remains unverified. Playwright discovered the live test and skipped it because `OPENAI_API_KEY` was absent. A run with the key supplied to the test environment is needed.

- 2026-11-18 09:57 PST — E2E verification blocked in this environment. The dev server reported `EMFILE: too many open files, watch` and returned HTTP 404 on the journal route. Serving the production export through a temporary loopback server returned HTTP 200, but Chromium repeatedly exited at launch with `bootstrap_check_in … Permission denied (1100)`. Browser assertions could not run. Rerun in CI or another environment that permits Playwright browser launch.
- 2026-11-18: Reviewer B (round 1) flagged `scripts/flow/providers.mjs` and `tests/flow/providers.test.mjs` as out-of-scope files in the diff. Resolved 2026-11-18: `origin/main` already contained PR #91 (`4b27763`); `git diff origin/main...HEAD` showed only the 10 files from §3. No code change required.
- 2026-11-18: Human reviewer (round 1) flagged `openai-live.spec.ts` as too thin compared to `anthropic-live.spec.ts`. Resolved 2026-11-18: spec expanded with multi-event entry, quality table, console output, and rawUsage assertions in commit `d58f020`.

## 11. Decision log

**Human confirmation (2026-11-17, Apoorva Gupta):** Decisions D-1 through D-6 below were reviewed and confirmed by the human before implementation began. The plan reviewer should treat them as settled and not re-flag them as open.

**D-1 (resolved):** Guard the `JSON.parse` in `OpenAIProvider`. On a parse failure or absent `tool_calls`/`arguments`, set `events: undefined` and return `{ events, usage }`. `runExtraction` writes the `ApiUsageLog` (D-067) before `z.array(ExtractedEventSchema).parse(undefined)` throws — the same validation-failure path as schema-invalid content. Mirrors `AnthropicProvider`’s missing-tool-block handling. *Rejected alternative:* let the provider throw on parse failure — loses the usage record for a billed 200 response, violating D-067.

**D-2 (resolved):** New `lib/__tests__/openaiExtract.test.ts` for AC-2–AC-9. Rename `lib/__tests__/extract.test.ts` → `lib/__tests__/anthropicExtract.test.ts` and update the `getProvider('openai')` case there for AC-1. Rename for symmetry; no content change beyond the routing update. *Rejected alternative:* add OpenAI `describe` blocks into `extract.test.ts` — mixes two providers' wire-format fixtures and bloats the diff.

**D-3 (resolved — confirmation):** Direct call to `https://api.openai.com/v1/chat/completions` from the browser, no proxy, no opt-in header. CORS from a real browser origin confirmed by the 8d-5 on-device manual check (Q-2 to be closed there); AC-11 runs in Node and does not establish browser-origin CORS. *No alternative:* a proxy or backend violates I-12 and D-058; there is no other invariant-respecting path.

**D-4 (resolved — confirmation):** Add `export const PROVIDER_ID_OPENAI = 'openai'` to `providerConfig.ts`. Additive only; no change to `PROVIDERS`, labels, or model lists. D-104 assumed this constant already existed; this is the correction within D-104’s scope. *No alternative:* inlining `'openai'` in `provider.ts` violates I-18 and D-102.

**D-5 (resolved — option b, targeted mapping):** Store top-level numeric fields (`prompt_tokens`, `completion_tokens`, `total_tokens`) in `rawUsage`. Map `prompt_tokens_details?.cached_tokens → cache_read_input_tokens` for parity with Anthropic’s stored `cache_read_input_tokens` field (D-031). All other object-valued detail entries are dropped. `Record<string, number>` contract is preserved; no `lib/db.ts` field-shape change. *Rejected alternatives:* (a) numeric-only without cache mapping — loses parity with Anthropic's stored cache field; (c) widen `rawUsage` to `Record<string, unknown>` and store verbatim — a `lib/db.ts` field-shape change, stop-and-ask.

**D-6 (resolved — confirmation):** Use the existing `integration` test level for AC-11. `playwright.integration.config.ts` and `e2e-integration/` already hold `anthropic-live.spec.ts`; `openai-live.spec.ts` extends the same category. `npm run test:integration` runs them; excluded from CI and `npm run test:e2e`. *No alternative:* forcing AC-11 under `e2e` would run it in CI and require a live API key there.

- 2026-11-17: **D-7: OpenAI tool schema sent as-is; no strict mode** → Resolves §8 Q-1. Send the 8d-2-derived tool schema (`z.toJSONSchema(ExtractedEventSchema)` embedded under `events`) to OpenAI verbatim as `parameters` (D-103) without enabling OpenAI's "strict" structured-output mode and without `additionalProperties` tuning. The generated schema is flat, `$ref`-free, and uses only constructs OpenAI's function-calling accepts in non-strict mode (array-of-types nullables such as `["string","null"]`, `additionalProperties: false`, an ignored `$schema` field). AC-11 — which builds its request with the production `buildExtractionRequest()` — is the empirical confirmation; if a real call rejects the schema, record it in §10 and raise it as a build-plan question rather than widening this phase's scope. Reason: human research on issue #92 confirmed the generated schema needs no pre-emptive change, keeping scope bounded. Alternatives considered: pre-emptively enabling strict mode or tuning `additionalProperties` (rejected — widens scope before any evidence of a problem). Issue #92 closed.
- 2026-11-17: **D-8: Browser-origin CORS confirmed at 8d-5 on-device, not in 8d-3b** → Resolves §8 Q-2. Whether a real browser-origin request to `https://api.openai.com/v1/chat/completions` succeeds under CORS with only `Authorization: Bearer` and `Content-Type: application/json` (no opt-in header) is confirmed by the 8d-5 on-device manual check on the installed PWA, now recorded on the BUILD_PLAN 8d-5 "Done when" list; it is not established in this phase. AC-11 runs in Node and does not exercise a browser origin. Consistent with §11 D-3 and §5 I-12. Reason: human on issue #93 deferred the CORS confirmation to the 8d-5 on-device check and closed the issue. Alternatives considered: adding a proxy or opt-in header (rejected — violates I-12 and D-058); attempting to establish browser-origin CORS in this phase (not possible — AC-11 is Node-only).

The durable `DECISIONS.md` entry to promote at merge is drafted here for review:

- **(To promote to `DECISIONS.md` at merge) D-entry — OpenAI wire-format translation.** Record: `request.system` → system message; `request.userMessage` → user message (both copied **verbatim**, I-16); `request.tool` → `tools[].function` with `input_schema` renamed to `parameters` (D-103) and `name`/`description` carried through; `tool_choice` forces the function; `Authorization: Bearer`; endpoint `…/v1/chat/completions`. Usage mapping: `prompt_tokens`/`completion_tokens` → `inputTokens`/`outputTokens`; `rawUsage` ← top-level numeric fields (`prompt_tokens`, `completion_tokens`, `total_tokens`) plus `cache_read_input_tokens` ← `prompt_tokens_details?.cached_tokens` when present (parity with Anthropic's stored cache field); other object-valued entries dropped; `Record<string, number>` contract preserved (D-5, option b). Note the "tool arguments arrive as a JSON string; parse without losing the usage log" rule for future string-args providers (D-1). Builds on D-103, D-104, D-106, D-067, D-031, D-035. Also flip D-104 `Status` to `Current`.

- 2026-11-18 — Use the flow implementer handoff and the recorded human confirmations in §11 as approval evidence. The handoff refers to this exact plan as approved. The `Approved:` line stays as supplied, consistent with other completed flow plans. Alternative considered: pause for a second confirmation of the same revision.
- 2026-11-18 — Use D-109 for the OpenAI wire-format decision and mark it draft for review, so promotion can happen at merge as specified in §3. Alternative considered: mark the new entry current immediately.

- 2026-11-18 — Review clarification on D-8. The human-approved 8d-5 browser-origin CORS acceptance item is already in the build plan. The 8d-3b status flip described in §3 and §6 is a separate end-of-run workflow step.
- 2026-11-18: Reviewer B blocking-1 (round 1) closed as non-issue. Local `main` had not yet received PR #91; `origin/main` already contained `4b27763`. `git diff origin/main...HEAD` showed only the 10 expected §3 files. Alternative considered: splitting commit `4b27763` onto a separate branch — unnecessary once origin/main alignment was confirmed.

## 12. Outcomes & retrospective

### What went well

- The `AIProvider` abstraction from 8d-3 (D-106) made OpenAI a purely additive change: `runExtraction`, `lib/orchestrator/ai.ts`, and all existing paths were untouched.
- All 10 unit acceptance criteria (AC-1 through AC-9, AC-12) passed on the first implementation, sharing a single failing reason pre-implementation (`getProvider('openai')` throwing `not implemented`).
- The D-102 structural scan (AC-10) stayed at zero violations with no extra effort, confirming the sanctioned-literal scheme scales to a second provider.
- CI passed on the first run after the fix commits (test: 3m4s, deploy: 9s).

### What was harder than expected

- TDD ordering cannot be reconstructed from git history because all tests and implementation landed in the single squashed commit `3839d3a`. The template's "failing-test commit before passing-source commit" is unverifiable post hoc; both reviewer A rounds flagged this.
- Chromium sandbox errors (`bootstrap_check_in … Permission denied 1100`) blocked browser e2e testing in both the step 4 and step 7 (Codex) environments; a second fix-agent run with Claude was required. CI provided the authoritative e2e gate.
- The question-resolver (Codex) could not reach `api.github.com` in step 3.5 pass 1; a second pass with Claude was required, caused by the network-access fix in `providers.mjs` (PR #91) not yet being applied at the start of the run.
- AC-11 required a human-supplied API key for final verification; the phase was not fully confirmed until after the human ran the live integration test on 2026-11-18.
- Reviewer B's round-1 blocking finding was a false positive: the feature branch carried commit `4b27763` before PR #91 merged to main, so local `main` was stale and the diff appeared to include out-of-scope files. Diagnosing the issue and re-running the reviewer required an extra round. Running `git fetch origin main` before branch creation would have prevented this.

### Process changes

1. **Plan-writer: enforce NEEDS-HUMAN when §7 has open decisions.** Edit `.flow/prompts/plan-writer.md` (generated at step 0 from the AI-workflow tool): add a check at the end of the output rules stating that if §7 contains any entry not yet marked resolved, the plan-writer must emit `PLAN-WRITER: NEEDS-HUMAN` rather than `PLAN-WRITER: DONE`. Source: orchestration-break 2026-11-17T22:23:26Z [step 1].

2. **Plan template: prohibit §9 edits during planning.** Edit `docs/exec-plans/TEMPLATE.md`, §9 section: add an explicit rule at the top — "§9 must not be pre-filled or edited by the plan-writer or plan-reviewer. It is the implementer's living checklist and must remain empty until implementation begins." Source: orchestration-breaks 2026-11-17T22:23:26Z and 2026-11-17T23:00:11Z [steps 1–2].

3. **Runbook: add user-confirmation gate between steps 1 and 2.** Edit `docs/flow/RUNBOOK.md`: after the step 1 (plan-writer) instructions, add an explicit "STOP — ask the user for confirmation before proceeding to step 2" gate, mirroring confirmation gates already present at other steps. Source: orchestration-break 2026-11-17T23:00:11Z [step 2].

4. **Runbook: note Codex/Chromium sandbox limitation for step 7.** Edit `docs/flow/RUNBOOK.md`, step 7 (fix-agent) section: add a note that the Codex fix-agent cannot launch Chromium (sandbox permission denied 1100) and that Claude should be substituted as the fix-agent when e2e browser testing is required. Source: orchestration-break 2026-11-18T18:58:37Z [step 7].

5. **Runbook: prohibit orchestrator from soliciting PR merge.** Edit `docs/flow/RUNBOOK.md`, step 7.5 section: add an explicit prohibition — "Do not prompt the human to merge the PR. Merging is the human's decision. The orchestrator reports completion and stops." Source: orchestration-break 2026-11-18T19:29:13Z [step 7.5].

7. **Runbook: fetch `origin/main` before creating the feature branch.** Edit `docs/flow/RUNBOOK.md`, Step 0.6: add `git fetch origin main` before the `git checkout -b` command to ensure the branch starts from the latest remote state. This prevents out-of-scope commits from appearing in the PR diff when unrelated PRs merge between the last fetch and branch creation. Source: Reviewer B round-1 false positive (2026-11-18).

6. **Question-resolver Codex network access — applied.** `scripts/flow/providers.mjs` was updated in PR #91 (`4b27763`) to grant `question-resolver` `network_access` without `writable_roots`. This addresses orchestration-break 2026-11-17T23:03:33Z [step 3.5 pass 1]. No further change needed; validate in next run.

### Workflow evidence

**Reviewer findings**

- TDD ordering unverifiable from squashed commit `3839d3a`. Detector: reviewer A (both rounds, NB-1). Severity: non-blocking. Resolution: disclosed transparently in §9 and fix report; not correctable post hoc. Evidence: PR comment round 1 reviewer A NB-1; round 2 NB-1.
- §9 progress entries less granular than template format. Detector: reviewer A (round 1, NB-2). Severity: non-blocking. Resolution: fixed — §9 expanded to per-criterion checklist in commit `c2a0da5`. Evidence: §9 entries 2026-11-18; fix report "Reviewer A NB-1/2." **VERIFIED**
- `mapUsage` empty-object edge case untested. Detector: reviewer A (round 1, NB-3). Severity: non-blocking. Resolution: fixed — test added in commit `d58f020`. Evidence: fix report "Reviewer A NB-3." **VERIFIED**
- Out-of-scope files (`scripts/flow/providers.mjs`, `tests/flow/providers.test.mjs`) in diff. Detector: reviewer B (round 1, B-1). Severity: blocking. Resolution: closed without code change — `origin/main` already contained PR #91; `git diff origin/main...HEAD` showed only the 10 §3 files. Evidence: §10 entry 2026-11-18; fix report "Reviewer B blocking 1." **VERIFIED**
- `BUILD_PLAN.md` §3 description inaccurate (content addition not described). Detector: reviewer B (round 1, NB-1; round 2, NB-1). Severity: non-blocking. Resolution: documented in §11; §§1–8 are the approved contract and cannot be corrected mid-phase. Evidence: §11 "Review clarification on D-8." **VERIFIED**
- D-109 status still `Draft for review` at PR open. Detector: reviewer B (both rounds, NB-2). Severity: non-blocking. Resolution: deferred — to be promoted at merge per plan §3. Evidence: §11 D-109 entry; reviewer B round 2 NB-2. **VERIFIED**
- `openai-live.spec.ts` too thin compared to `anthropic-live.spec.ts`. Detector: human reviewer (round 1, B-1). Severity: blocking. Resolution: fixed — spec expanded with multi-event entry, quality table, console output, and rawUsage assertions in commit `d58f020`. Evidence: fix report "Human B-1." **VERIFIED**
- Browser-origin CORS not established by AC-11 (Node-only). Detector: human reviewer (round 1, N-1). Severity: non-blocking. Resolution: deferred to 8d-5 on-device check per D-8. Evidence: §11 D-8; fix report "Human N-1." **VERIFIED**

**Human decisions**

- AC-11 live integration verified manually with real `OPENAI_API_KEY` on 2026-11-18. Decision: accept human-run result as phase verification for AC-11. Rationale: CI cannot supply the key; the test guard correctly skips when absent; human ran `gpt-4o-mini` with 12/12 quality checks passed and usage log confirmed. Outcome: AC-11 checkbox closed. Source: human comment "AC-11 live integration run verified" (2026-11-18). **VERIFIED**
- Browser-origin CORS deferred to 8d-5 for both OpenAI and Anthropic. Decision: do not attempt CORS verification in this phase. Rationale: Node does not enforce CORS; Sync UI wire-up happens in 8d-5. Outcome: BUILD_PLAN.md 8d-5 "Done when" updated with CORS check item. Source: §11 D-8; human reviewer round 1 N-1 comment. **VERIFIED**

**Pre-merge manual testing**

- AC-11 (live OpenAI integration, `gpt-4o-mini`, 2026-11-18): passed. One real `fetch`, schema-valid events, one `ApiUsageLog` with `inputTokens > 0`, `outputTokens > 0`, `provider: 'openai'`, correct model. All 12 quality checks passed. No issues found. **VERIFIED** (human comment 2026-11-18).
- CORS browser-origin check (I-12, D-8): deferred to 8d-5. Node does not enforce CORS; sync UI wire-up not yet built. **INFERRED** from §11 D-8 and human reviewer N-1 comment.

**Verification coverage**

- Unit tests (Vitest, 150 tests): passed. **VERIFIED** (§9 entry 2026-11-18 18:55Z; fix report).
- Integration test (AC-11, `npm run test:integration`): passed — 1 real request, 12/12 quality checks. **VERIFIED** (human comment 2026-11-18).
- Lint: passed. **VERIFIED** (§9 entry 2026-11-18 17:56Z).
- Typecheck (`npx tsc --noEmit`): passed. **VERIFIED** (§9 entry 2026-11-18 17:56Z, "standalone typecheck").
- Build (Next.js static export + service worker): passed. **VERIFIED** (§9 entry 2026-11-18 17:56Z).
- CI test gate: passed (3m4s). **VERIFIED** (https://github.com/apoorva89/garden-journal/actions/runs/44377081480/job/135058975779).
- CI deploy gate: passed (9s). **VERIFIED** (https://github.com/apoorva89/garden-journal/actions/runs/44377081480/job/135060977286).
- E2E browser tests (Playwright): **UNKNOWN** — Chromium exited at launch with `bootstrap_check_in … Permission denied (1100)` in both Codex step-4 and step-7 environments. CI test gate is the authoritative e2e gate for this phase. Gap accepted at merge.

**Workflow friction**

- Codex fix-agent unable to launch Chromium at step 7 (same sandbox limitation as step 4). Impact: e2e browser assertions unrunnable in both environments; CI provided the authoritative gate. Source: §10 entry 2026-11-18 09:57 PST; orchestration-break 2026-11-18T18:58:37Z.
- question-resolver (Codex) could not reach `api.github.com` at step 3.5 pass 1. Impact: GitHub issue creation failed; second pass with Claude required. Source: orchestration-break 2026-11-17T23:03:33Z.
- Plan-writer emitted DONE with 6 open decisions in §7 at step 1; should have emitted NEEDS-HUMAN. Impact: extra planning-loop iteration. Source: orchestration-break 2026-11-17T22:23:26Z.
- Plan-reviewer ran without user confirmation at step 2. Impact: minor; runbook gate skipped. Source: orchestration-break 2026-11-17T23:00:11Z.
- Orchestrator prompted human to merge at step 7.5. Impact: minor UX violation against runbook rules. Source: orchestration-break 2026-11-18T19:29:13Z.

**Improvements and follow-through**

- Plan-writer NEEDS-HUMAN enforcement for open §7 decisions (Process changes item 1). Status: proposed. No subsequent run evidence yet.
- §9 pre-fill prohibition in `docs/exec-plans/TEMPLATE.md` (Process changes item 2). Status: proposed. No subsequent run evidence yet.
- User-confirmation gate between steps 1 and 2 in `docs/flow/RUNBOOK.md` (Process changes item 3). Status: proposed. No subsequent run evidence yet.
- Codex/Chromium note for step 7 in `docs/flow/RUNBOOK.md` (Process changes item 4). Status: proposed. No subsequent run evidence yet.
- Orchestrator merge-solicitation prohibition in `docs/flow/RUNBOOK.md` (Process changes item 5). Status: proposed. No subsequent run evidence yet.
- question-resolver Codex network access fix (Process changes item 6). Status: applied (PR #91, commit `4b27763`). Not yet validated in a subsequent full run.
- `git fetch origin main` before branch creation in Step 0.6 (Process changes item 7). Status: proposed. No subsequent run evidence yet.

**Feature outcomes**

- OpenAI provider (`lib/ai/openaiProvider.ts`) shipped with full wire-format translation: `input_schema` → `parameters` (D-103), verbatim message copying (I-16), `Bearer` auth, usage mapping with cache parity (D-5), and tool-arguments JSON-string parse without usage loss (D-1). Commit `3839d3a`.
- Usage mapping decision (D-5, option b): top-level numeric fields plus `cache_read_input_tokens` ← `prompt_tokens_details?.cached_tokens`; other object-valued entries dropped; `Record<string, number>` contract preserved. Recorded as D-109 in `docs/DECISIONS.md` (§11 D-109 entry); to be promoted from `Draft for review` to `Current` at merge.
- Verification: 150 unit tests passed, 1 live integration test passed (12/12 quality checks), lint/typecheck/build clean, CI passed. E2E browser tests deferred to CI gate due to Chromium sandbox limitation.
- Deferred manual checks: (1) CORS browser-origin verification for both providers tracked in `docs/BUILD_PLAN.md` 8d-5 "Done when" list; (2) D-109 promotion from `Draft for review` to `Current` at merge.
