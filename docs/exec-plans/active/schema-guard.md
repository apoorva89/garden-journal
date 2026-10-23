# Exec plan: schema-guard — Runtime startup schema check

**Phase:** schema-guard  
**Status:** In progress  
**Build plan reference:** §schema-guard (order 3)

---

## 1. Scope

Add a runtime check that tells a tester to wipe their local DB when it is missing a store or index the code expects. Boolean result only — no migration, no automatic wipe, no problem list.

## 2. Files to touch

| File | Change |
|---|---|
| `lib/db.ts` | Add `SCHEMA` constant; refactor `upgrade()` to loop over it; add `isSchemaValid(db): boolean` |
| `lib/__tests__/schemaGuard.test.ts` | New: 4 unit tests |
| `app/schema-guard.tsx` | New: `SchemaGuard` client component |
| `app/layout.tsx` | Wrap `{children}` in `SchemaGuard` |
| `docs/DECISIONS.md` | D-101 (done) |
| `docs/ARCHITECTURE.md` | Note on §9 invariant 6 (done) |
| `docs/BUILD_PLAN.md` | schema-guard row (done) |

## 3. Design decisions captured in the issue

- `SCHEMA`: `Record<storeName, { options?, indexes? }>`. `upgrade()` loops over it.
- `isSchemaValid(db)`: true iff every store in SCHEMA is in `db.objectStoreNames` and every listed index is in that store's `indexNames`. Extra stores/indexes ignored. If it throws → false.
- DB version stays at 1. No oldVersion/newVersion logic.
- Blocking screen text: "Local data is out of date. Wipe it to continue. Unsynced entries will be lost."
- Wipe button: close DB connection, `indexedDB.deleteDatabase('garden-journal')`, reload.
- Blocked message: "Close other tabs of this app and try again."

## 4. Acceptance criteria

| # | Criterion | Level | Test |
|---|---|---|---|
| AC-1 | Fresh DB created from SCHEMA passes | Unit | `lib/__tests__/schemaGuard.test.ts` |
| AC-2 | DB missing a store fails | Unit | `lib/__tests__/schemaGuard.test.ts` |
| AC-3 | DB missing an index fails | Unit | `lib/__tests__/schemaGuard.test.ts` |
| AC-4 | A check that throws returns false | Unit | `lib/__tests__/schemaGuard.test.ts` |

No e2e test per the issue spec.

## 5. Progress log

- [x] Doc changes (DECISIONS.md, ARCHITECTURE.md, BUILD_PLAN.md)
- [ ] Unit tests (fail first)
- [ ] SCHEMA + upgrade() refactor
- [ ] isSchemaValid
- [ ] SchemaGuard component
- [ ] app/layout.tsx wiring
- [ ] Tests pass, lint, typecheck, build
