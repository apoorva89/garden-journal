# Garden Journal — flow context

This file is prepended to every role prompt by `flow`. It maps generic doc references to
this repo's actual files and section headings.

## Doc names and sections

- **The workflow guide** is `AGENTS.md`. Read these sections for your role:
  - plan-writer: "Workflow for each phase or sub-phase" (steps 1–2), "Stop and ask before"
  - plan-reviewer: "Stop and ask before"
  - implementer: "Workflow for each phase or sub-phase" (steps 3–4), "Working rules", "Docs",
    "Stop and ask before"
  - reviewer A: "Review" (checks 1 and 4 specifically), "Definition of done"
  - reviewer B: "Review" (checks 2, 3, 5, and 6 specifically), "Working rules",
    "Stop and ask before"
  - fix agent: "Workflow for each phase or sub-phase" (steps 4 and 7)
- **The architecture invariants doc** is `docs/ARCHITECTURE.md`, section "9. Invariants".
- **The decision log** is `docs/DECISIONS.md`.
- **The plan template** is `docs/exec-plans/TEMPLATE.md`.
- **The build plan** is `docs/BUILD_PLAN.md`.

## Repo conventions

- Branches: `feat/<phase>-<slug>`.
- Active exec plans: `docs/exec-plans/active/`. Completed: `docs/exec-plans/completed/`.
- Test files: `**/*.test.ts`, `**/*.test.tsx`, `tests/**`, `e2e/**`.
- State is persisted to IndexedDB; never use `localStorage` or `sessionStorage` for app data.
- This is a Next.js static export (no server-side rendering at runtime). All pages must
  build with `next export`.
