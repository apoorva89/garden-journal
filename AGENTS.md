<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md

Garden Journal: an offline-first personal garden journal PWA. Next.js static export, TypeScript, Tailwind, IndexedDB via `idb`. Node 20.

This file is a map. Read the documents it points to before changing code.

## Where things are

- `ARCHITECTURE.md`: code map, data model, sync pipeline, error handling. §9 lists the invariants that must not be violated. Read §9 before touching `lib/db.ts`, the sync pipeline, AI code, or the service worker.
- `docs/DECISIONS.md`: settled decisions (D-###) with rationale. Do not reverse a decision without asking.
- `docs/[build-plan filename]`: canonical build plan. Current phase: [TBD].
- `docs/exec-plans/active/`: the exec plan for the phase in progress.

## Commands

- `npm install`
- `npm run dev`: dev server. `app/dev/` is a temporary wipe route; see Working rules.
- `npm run lint`
- `npm run test`: Vitest, data layer
- `npm run test:e2e`: Playwright, UI
- `npm run build`: `next build` then the service worker build. Both must succeed.
- `npx tsc --noEmit`: typecheck (no script yet)

## Workflow for each phase or sub-phase

1. Read the build plan entry for the work and ARCHITECTURE §9.
2. Write an exec plan in `docs/exec-plans/active/` covering: scope, files to touch, acceptance criteria written as test cases, decisions needed, open questions. Stop and wait for approval.
3. After approval, write the tests for the acceptance criteria first. Run them and confirm they fail for the right reason.
4. Implement until the tests pass. Keep the exec plan's progress and decision logs current as you work.
   - If the same test or the same error fails three times, stop. Do not attempt a fourth fix. Report: what you tried, the exact error, and your best assessment of the cause.
5. Run the done checklist, commit, and open a PR.
6. Review. Start a fresh session to review the PR (see Review). Do not review your own work in the implementing session.
7. Report: what changed, what didn't, what you're unsure of, and any deviation from the plan.

## Definition of done

- `lint`, `typecheck`, `test`, `test:e2e`, and `build` all pass locally and in CI.
- All UI tests pass. Do not add `skip`, `fixme`, or `only` to get green.
- The change stays inside the approved exec plan.
- The PR lists manual on-device checks as pending. Do not treat a Safari tab check as on-device (ARCHITECTURE §7, §8).
- The PR description covers deviations from the plan and any changes to `docs/DECISIONS.md` or `ARCHITECTURE.md`.
- The review step has run and its blocking findings are resolved.

## Review

The review runs in a fresh session with no implementation context. It reads the PR diff, the exec plan, ARCHITECTURE §9, `docs/DECISIONS.md`, and this file's Definition of done. It checks:

- Each acceptance criterion has a test that passes, and the test checks what the criterion says.
- No change falls outside the approved exec plan.
- No §9 invariant is broken.
- No tests were skipped, weakened, or deleted.
- New or changed decisions have matching D-entries, and architecture changes are reflected in `ARCHITECTURE.md`.
- No dependency was added without approval.

The reviewer posts findings as a PR comment, split into blocking and non-blocking. The implementing agent fixes blocking items on the same branch. If a blocking item requires a change to the plan, stop and ask rather than fix it. The human reviews after the agent review and merges.

## Git

- Work on a feature branch. Never commit to `main`. Branch naming: `feature/<phase>-<slug>`.
- The agent commits, pushes, and opens the PR. The human reviews and merges.

## Stop and ask before

- Changing the `lib/db.ts` schema or any store
- Adding a dependency
- Changing an invariant in ARCHITECTURE §9
- Changing AI provider behaviour or the extraction spec
- Touching the service worker, manifest, or base path
- Any change that departs from the approved exec plan
- Editing the build plan. Scope changes go through the human first.

When you stop, say what you found, what you'd propose, and what you need. Do not silently fix the plan.

## Docs

- Changes to `docs/DECISIONS.md` and `ARCHITECTURE.md` go in the PR for explicit review. Draft new D-entries with rationale. Do not renumber existing entries.
- Keep doc changes in the same PR as the code change they describe.

## Working rules

- Build only what the approved phase covers. Do not start later phases.
- Every IndexedDB access goes through `lib/db.ts`.
- Network calls never happen on a save path. Weather and AI calls run only in the sync orchestrator, started by the user.
- No automatic AI retries.
- Do not add a second schema or type for extracted events. Derive from `ExtractedEventSchema`.
- Provider and model come from Settings. Do not hard-code them.
- `app/dev/` is temporary and will be removed before release. Do not build on it.