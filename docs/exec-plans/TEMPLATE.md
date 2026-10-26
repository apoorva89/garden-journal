# Exec plan:

Build plan: docs/BUILD_PLAN.md, phase 
Approved: ,    (blank until approved)

Rules for this file:

- Sections 1 to 8 are the approved contract. Do not change them without an approved plan change (section 11).
- Sections 9 to 11 are living. Update them as work proceeds.
- Write "None" for any section with nothing to record. Do not invent entries.
- Checklists appear only in section 9.

## 1. Purpose

Two to four sentences: what this phase delivers and why now. Name the ARCHITECTURE.md sections it touches.

## 2. Scope

### In scope

- ...

### Out of scope

- ... (Name items someone could reasonably assume are included, and say why they are excluded. Link the GitHub Issue if one exists.)



## 3. Files

Expected files, grouped by layer (lib/db.ts, lib/, components/, app/, tests/, e2e/). Mark any file in a stop-and-ask area with [STOP-ASK].

## 4. Acceptance criteria

Each criterion is a test case. Write the test first and confirm it fails for the right reason. The criterion is covered only by a test that asserts the observable outcome the criterion describes, for example the stored record after an edit. A test that only checks that code runs, that a component renders, or that a function was called does not count.


| ID   | Observable behaviour | Level               | Test file and name |
| ---- | -------------------- | ------------------- | ------------------ |
| AC-1 | ...                  | unit / e2e / manual | ...                |


`manual` is allowed only for behaviour that cannot be automated. Manual items are checked on device and listed as pending in the PR.

## 5. Invariant check (ARCHITECTURE §9)


| Invariant | Touched  | How it is held | Test or check |
| --------- | -------- | -------------- | ------------- |
| <from §9> | yes / no | ...            | ...           |


Adds a field derived from another field: yes / no. If yes: the denormalized-fields table in ARCHITECTURE.md §3 is updated, and two tests are added and listed in section 4. One shows that a change to the source field updates every dependent field. The other shows that a failed second write rolls back the first. This is also a lib/db.ts change, so record it in section 6.
If the phase requires changing an invariant in ARCHITECTURE §9, stop and ask before implementing.

## 6. Dependencies and stop-and-ask triggers

- New packages: none / list [STOP-ASK]
- lib/db.ts schema or store changes: none / describe [STOP-ASK]. If it adds or removes a store or index, or changes what any stored field can hold (type, nullability, allowed values, shape) then exec plan names the affected stores and fields, and add a manual AC to §4 requiring a DB wipe on test devices before testing — there is no migration path (D-034, D-081). 
- Service worker, manifest, or base path changes: none / describe [STOP-ASK]
- AI provider behaviour or extraction spec changes: none / describe [STOP-ASK]
- Build plan edits: none / describe [STOP-ASK]



## 7. Decisions needed before approval

Decisions the approver must make before implementation. Each has options and a recommendation. Once the plan is approved, these move into the Decision Log as resolved.

- D-1: question. Options: (a) ... (b) ... Recommendation: ...



## 8. Open questions

Questions that do not block approval. Any that survive the phase become GitHub Issues.

- Q-1: ... (Issue #)



## 9. Progress

Checklist, mandatory. Timestamped in UTC. Record the failing-test step as well as the passing step, so the order of work is visible.

- [ ] YYYY-MM-DD HH:MMZ: AC-1 test written, failing (reason: ...)
- [ ] YYYY-MM-DD HH:MMZ: AC-1 passing



## 10. Surprises & discoveries

Anything found during implementation that the plan did not anticipate. This includes failed attempts. After a test or error has failed twice, record each attempt with the change tried, the exact error text, and the agent's assessment of cause. After the third failure, stop and report here.

- YYYY-MM-DD HH:MMZ: ...



## 11. Decision log

Decisions made during implementation, with date, decision, reason, and alternatives considered. Plan changes go here too. Mark each one "requires approval" when it departs from sections 1 to 8, and record who approved it. Durable decisions are copied into docs/DECISIONS.md at merge.

- YYYY-MM-DD: Decision. Reason. Alternatives. [requires approval: approved by , ]



## 12. Outcomes & retrospective

Filled in at completion: what was delivered, what differed from the plan and why, and any follow-up Issues created. The plan moves to docs/exec-plans/completed/ after merge.