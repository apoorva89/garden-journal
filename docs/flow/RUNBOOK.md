# Workflow Runbook

All commands run from the **Garden Journal repo root**. After completing each step, stop and ask
the user which step to run next before proceeding. Claude Code remains the interactive
orchestrator; only individual execution providers change.

## Setup

- Node 20 on PATH
- Authenticated `claude` CLI (run `claude --version` to verify)
- `codex` CLI on PATH if using `FLOW_PROVIDER=codex`
- `gh auth status` succeeds

Choose `export FLOW_PROVIDER=claude` (default) or `export FLOW_PROVIDER=codex` before any
agent step. Both providers use the same commands and `.result` consumers below.

A nonzero runner exit means stop: inspect the diagnostic path before proceeding.
The latest link retains an earlier successful run on failure; do not consume that stale
result as the output of the failed invocation. No workflow command merges a PR.

**Orchestration breaks log.** When any of the following occur, append an entry to
`.flow/orchestration-breaks.md` immediately before continuing:
- An agent emits an unrecognized marker (any value not listed in this document's check commands)
- A step exits non-zero and you decide to proceed anyway
- A session is interrupted (timeout, limit hit) and you resume or restart it
- You make a judgment call not covered by the instructions in this document

Use this command, filling in the step number and a one-line description:

```bash
echo "- $(date -u +%Y-%m-%dT%H:%M:%SZ) [step N] <what happened and what you decided>" >> .flow/orchestration-breaks.md
```

---



## Step 0 — (re)generate combined prompts

Run at the start of every run (combined prompts are always generated fresh from the repo-local
source):

```bash
mkdir -p .flow/combined
for f in tools/flow/prompts/*.md; do
  role=$(basename "$f" .md)
  cat docs/flow/context.md "$f" > .flow/combined/${role}-combined.md
done
printf '\n---\n## Run %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> .flow/orchestration-breaks.md
```

---



## Step 0.5 — set phase and slug

Ask the user for the phase, slug, and one-line description separately:

- "What is the phase? (e.g. `8d-2`)"
- "What is the slug? (e.g. `extraction-request-builder`)"
- "What is the one-line description for the task prompt? (e.g. `build the extraction request builder`)"

Once you have all three, replace every occurrence of `<phase>` with the phase value, every
occurrence of `<slug>` with the slug value, and every occurrence of `<one-line description>`
with the description value in the commands below before running any further step.

---



## Step 0.6 — create feature branch

```bash
git checkout -b feat/<phase>-<slug>
```

---



## Step 1 — plan-writer (initial draft)

```bash
node scripts/flow/run.mjs --provider "${FLOW_PROVIDER:-claude}" \
  --role plan-writer --plan "docs/exec-plans/active/<phase>-<slug>.md" \
  --task "Task: Write the plan for phase <phase> — <one-line description>."
```

---



## Step 2 — plan-reviewer

```bash
node scripts/flow/run.mjs --provider "${FLOW_PROVIDER:-claude}" \
  --role plan-reviewer --plan "docs/exec-plans/active/<phase>-<slug>.md" \
  --task "Task: Review the plan at docs/exec-plans/active/<phase>-<slug>.md."
```

Check the outcome:

```bash
jq -r '.result' .flow/plan-reviewer-run-latest.json | grep "^PLAN-REVIEW:"
```

If output is `PLAN-REVIEW: APPROVED`, proceed to Step 3.5. If `PLAN-REVIEW: ISSUES`, run Step 3.

---



## Step 3 — plan-writer (address-review loop)

Run only if step 2 ended with `PLAN-REVIEW: ISSUES`.

```bash
node scripts/flow/run.mjs --provider "${FLOW_PROVIDER:-claude}" \
  --role plan-writer --plan "docs/exec-plans/active/<phase>-<slug>.md" \
  --artifact-name plan-writer-revise \
  --task "The plan is at docs/exec-plans/active/<phase>-<slug>.md.
Address the following review comments:

$(jq -r '.result' .flow/plan-reviewer-run-latest.json)"
```

Return to Step 2. Repeat Steps 2–3 until Step 2 ends with `PLAN-REVIEW: APPROVED`.

---



## Step 3.5 — question-resolver (conditional — skip if §8 is empty)

Check whether §8 has any open questions first.

**First check** — look for unresolved questions tagged `(Issue:`:

```bash
awk '/^## 8\. /,/^## 9\./' docs/exec-plans/active/<phase>-<slug>.md | grep "(Issue:"
```

If the first check has output, proceed to Pass 1 below.

**Second check** — if the first check has no output, look for any remaining non-empty §8 content:

```bash
awk '/^## 8\. /,/^## 9\./' docs/exec-plans/active/<phase>-<slug>.md \
  | grep -v "^$" | grep -v "^## [89]\."
```

If the second check has output (e.g., questions self-resolved and marked "Not expected to become
an Issue"), surface it to the human: show the content and ask "§8 has content not tagged
`(Issue:` — is it fully resolved, or should we run Step 3.5?" Only skip to Step 4 if both
checks produce no output.

### Pass 1 — create issues and post proposals

```bash
node scripts/flow/run.mjs --provider "${FLOW_PROVIDER:-claude}" \
  --role question-resolver --plan "docs/exec-plans/active/<phase>-<slug>.md" \
  --artifact-name question-resolver-pass1 \
  --task "Task: Resolve all open questions in §8 of docs/exec-plans/active/<phase>-<slug>.md."
```

Verify: a GitHub issue is created for each §8 question and its URL is recorded in §8; a proposal
comment is posted on each issue; §11 is not yet modified; marker is
`QUESTIONS-RESOLVED: NEEDS-HUMAN`.

### Human gate

Review each GitHub issue comment and approve, modify, or reject the proposal directly in the
issue thread.

### Pass 2 — write ratified decisions

```bash
node scripts/flow/run.mjs --provider "${FLOW_PROVIDER:-claude}" \
  --role question-resolver --plan "docs/exec-plans/active/<phase>-<slug>.md" \
  --artifact-name question-resolver-pass2 \
  --task "Task: Resolve all open questions in §8 of docs/exec-plans/active/<phase>-<slug>.md."
```

Verify: each approved question has its D-N entry appended to §11, is removed from §8, and its
issue is closed. Marker is `QUESTIONS-RESOLVED: DONE` once §8 is empty.

If any §7 items are answered by the new decisions, run plan-writer once more to clear §7:

```bash
node scripts/flow/run.mjs --provider "${FLOW_PROVIDER:-claude}" \
  --role plan-writer --plan "docs/exec-plans/active/<phase>-<slug>.md" \
  --artifact-name plan-writer-clear-s7 \
  --task "Task: Clear §7 items now answered by decisions in §11 for docs/exec-plans/active/<phase>-<slug>.md."
```

---



## Step 4 — implementer

```bash
node scripts/flow/run.mjs --provider "${FLOW_PROVIDER:-claude}" \
  --role implementer --plan "docs/exec-plans/active/<phase>-<slug>.md" \
  --task "Task: Implement the approved plan at docs/exec-plans/active/<phase>-<slug>.md."
```

---



## Step 4.5 — Open PR

```bash
jq -r '.result' .flow/implementer-run-latest.json | grep -v "^IMPLEMENTER: DONE" > .flow/pr-body.md
git push -u origin $(git branch --show-current)
export PR_URL=$(gh pr create --title "<phase>: <slug>" --body-file .flow/pr-body.md)
export HEAD_SHA=$(git rev-parse HEAD)
echo "PR_URL=$PR_URL HEAD_SHA=$HEAD_SHA"
```

Verify: the PR description matches the implementer's output (minus the marker line); the diff is
visible on GitHub.

CI starts automatically on push and runs concurrently with Steps 5 and 6. If CI fails before
the reviewers finish, address the failure before proceeding to Step 7.

---



## Step 5 — pr-reviewer-a

Steps 5 and 6 are independent and can run simultaneously. Each invocation fetches
the current PR description from GitHub before starting the reviewer and stops if
that fetch fails. Re-reviews include the fix report as separate context.

### Initial run (after step 4.5)

```bash
(
  PR_BODY=$(gh pr view "$PR_URL" --json body --jq .body) || exit $?
node scripts/flow/run.mjs --provider "${FLOW_PROVIDER:-claude}" \
  --role pr-reviewer-a --plan "docs/exec-plans/active/<phase>-<slug>.md" \
  --task "Plan: docs/exec-plans/active/<phase>-<slug>.md
PR URL: $PR_URL
Base branch: main
Head SHA: $HEAD_SHA
Diff:
$(git diff main...$HEAD_SHA)
PR body:
$PR_BODY"
)
```



### Re-run (after step 7 fix)

```bash
(
  PR_BODY=$(gh pr view "$PR_URL" --json body --jq .body) || exit $?
node scripts/flow/run.mjs --provider "${FLOW_PROVIDER:-claude}" \
  --role pr-reviewer-a --plan "docs/exec-plans/active/<phase>-<slug>.md" \
  --task "Plan: docs/exec-plans/active/<phase>-<slug>.md
PR URL: $PR_URL
Base branch: main
Head SHA: $HEAD_SHA
Diff:
$(git diff main...$HEAD_SHA)
PR body:
$PR_BODY

Fix report:
$(cat .flow/fix-report.txt)"
)
```

Post the output as a PR comment:

```bash
jq -r '.result' .flow/pr-reviewer-a-run-latest.json > .flow/pr-reviewer-a-output.txt
gh pr comment $PR_URL --body-file .flow/pr-reviewer-a-output.txt
```

---



## Step 6 — pr-reviewer-b

Steps 5 and 6 are independent and can run simultaneously. Each invocation fetches
the current PR description from GitHub before starting the reviewer and stops if
that fetch fails. Re-reviews include the fix report as separate context.

### Initial run (after step 4.5)

```bash
(
  PR_BODY=$(gh pr view "$PR_URL" --json body --jq .body) || exit $?
node scripts/flow/run.mjs --provider "${FLOW_PROVIDER:-claude}" \
  --role pr-reviewer-b --plan "docs/exec-plans/active/<phase>-<slug>.md" \
  --task "Plan: docs/exec-plans/active/<phase>-<slug>.md
PR URL: $PR_URL
Base branch: main
Head SHA: $HEAD_SHA
Diff:
$(git diff main...$HEAD_SHA)
PR body:
$PR_BODY"
)
```



### Re-run (after step 7 fix)

```bash
(
  PR_BODY=$(gh pr view "$PR_URL" --json body --jq .body) || exit $?
node scripts/flow/run.mjs --provider "${FLOW_PROVIDER:-claude}" \
  --role pr-reviewer-b --plan "docs/exec-plans/active/<phase>-<slug>.md" \
  --task "Plan: docs/exec-plans/active/<phase>-<slug>.md
PR URL: $PR_URL
Base branch: main
Head SHA: $HEAD_SHA
Diff:
$(git diff main...$HEAD_SHA)
PR body:
$PR_BODY

Fix report:
$(cat .flow/fix-report.txt)"
)
```

Post the output as a PR comment:

```bash
jq -r '.result' .flow/pr-reviewer-b-run-latest.json > .flow/pr-reviewer-b-output.txt
gh pr comment $PR_URL --body-file .flow/pr-reviewer-b-output.txt
```

---



## Step 6.5 — Human review gate

Before running the fix-agent, surface both reviewer outputs so the human can weigh in. This is
the right moment to add scope clarifications, flag manual-check changes, or adjust what the
fix-agent should focus on.

Show the reviewer outputs:

```bash
cat .flow/pr-reviewer-a-output.txt .flow/pr-reviewer-b-output.txt
```

Ask the user: "Do you want to add any comments before the fix-agent runs?" If yes, post them:

```bash
gh pr comment $PR_URL --body "<user's comments>"
```

Then check whether any reviewer output or the user's comments mention scope changes or updates
to manual-check items. If so, fetch the PR body and update it before proceeding:

```bash
gh pr view $PR_URL --json body --jq .body > .flow/pr-body-current.md
# edit .flow/pr-body-current.md to reflect the current scope and manual-check state, then:
gh pr edit $PR_URL --body-file .flow/pr-body-current.md
```

If neither the reviewer outputs nor the user's comments mention scope or manual-check changes,
skip the PR body update.

Finally, ask: "Should the fix-agent proceed, or do you need to clarify anything further on the
PR first?" Proceed to Step 7 only when the user confirms.

---



## Step 7 — fix-agent

Run if step 5 or 6 posted blocking comments. After blocking items are addressed, a human gate
below lets you decide whether non-blocking items should also be fixed before re-review.

Fetch the full PR comment thread first:

```bash
gh pr view $PR_URL --comments > .flow/pr-comments.txt
```

Then run the fix-agent:

```bash
node scripts/flow/run.mjs --provider "${FLOW_PROVIDER:-claude}" \
  --role fix-agent --plan "docs/exec-plans/active/<phase>-<slug>.md" \
  --task "Plan: docs/exec-plans/active/<phase>-<slug>.md
PR URL: $PR_URL
PR comments (all, in chronological order):
$(cat .flow/pr-comments.txt)"
```

Push the new commits and post the fix report as a PR comment:

```bash
git push
jq -r '.result' .flow/fix-agent-run-latest.json > .flow/fix-report.txt
gh pr comment $PR_URL --body-file .flow/fix-report.txt
```

If the marker is `FIX-RESULT: DONE`:

Ask the user to review `.flow/pr-comments.txt` for any remaining non-blocking items and confirm:
"Should the fix-agent address these before re-review, or proceed as-is?"

- If **yes**: re-run Step 7 with a scoped task — insert the line
`"Task: Address only non-blocking comments from the review. Blocking items are already resolved — do not re-address them."` before the `Plan:` line
in the fix-agent command — then continue.
- If **no**: proceed.

Then capture the new HEAD SHA before re-running steps 5 and 6:

```bash
export HEAD_SHA=$(git rev-parse HEAD)
```

Repeat until both reviewers emit `FLOW-VERDICT ... verdict=APPROVED`. Confirm with:

```bash
jq -r '.result' .flow/pr-reviewer-a-run-latest.json | grep "^FLOW-VERDICT"
jq -r '.result' .flow/pr-reviewer-b-run-latest.json | grep "^FLOW-VERDICT"
```

If the marker is `FIX-RESULT: NEEDS-HUMAN`, review the unresolved items in the fix report and
post your guidance as a PR comment:

```bash
gh pr comment $PR_URL --body "<your guidance on the unresolved items>"
```

Then re-run step 7 — the fix-agent will pick up your comment and retry the unresolved items.

---



## Step 7.5 — Human signoff

Ask the user: "What is your verdict on the PR — APPROVED or BLOCKING?"

**If APPROVED:** post the verdict comment:

```bash
HEAD=$(git rev-parse HEAD)
gh pr comment $PR_URL --body "FLOW-VERDICT reviewer=human sha=${HEAD} verdict=APPROVED"
```

Verify: all three `FLOW-VERDICT` comments (reviewer=a, reviewer=b, reviewer=human) are present
on the PR and reference the same SHA:

```bash
gh pr view $PR_URL --comments | grep "FLOW-VERDICT"
```

If any SHA values differ, re-run the reviewer step whose SHA is stale (Step 5 or 6) with the
current `$HEAD_SHA` before asking for the human verdict again.

**If BLOCKING:** ask the user for their comments, then post them as a blocking finding:

```bash
HEAD=$(git rev-parse HEAD)
gh pr comment $PR_URL --body "FLOW-VERDICT reviewer=human sha=${HEAD} verdict=BLOCKING

<user's comments>"
```

Return to Step 7 so the fix-agent can address the blocking findings. After the fix-agent
completes, re-run Steps 5 and 6 before requesting another human verdict.

---



## Step 8 — retro-writer

Fetch the full PR comment thread first:

```bash
gh pr view $PR_URL --comments > .flow/pr-comments.txt
```

Then run the retro-writer:

```bash
node scripts/flow/run.mjs --provider "${FLOW_PROVIDER:-claude}" \
  --role retro-writer --plan "docs/exec-plans/active/<phase>-<slug>.md" \
  --task "Plan: docs/exec-plans/active/<phase>-<slug>.md
Base branch: main
Head SHA: $HEAD_SHA
PR comment history:
$(cat .flow/pr-comments.txt)

Orchestration breaks:
$(cat .flow/orchestration-breaks.md 2>/dev/null || echo 'None recorded.')"
```

---



## Step 8.5 — retro-reviewer (manual step)

Tell the user to run the following command in their terminal:

```bash
claude --append-system-prompt "$(cat .flow/combined/retro-reviewer-combined.md)" \
  --allowedTools "Read,Edit,Write,Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git status *)"
```

And start the session with:

```
Plan: docs/exec-plans/active/<phase>-<slug>.md
```

Work through the process change recommendations in §12, confirming each edit before it is
applied. When all recommendations are addressed, exit the session and let the orchestrator know.

---



## Step 8.6 — Commit process changes (human gate)

Review what changed during the retro-reviewer session:

```bash
git status
git diff
```

Ask the user: "These files changed during the retro-reviewer session. Which should be staged
and committed?" Pay particular attention to files outside docs/exec-plans/ — the
retro-reviewer may have changed ARCHITECTURE.md, docs/DECISIONS.md, or .flow/ files.
Stage only the confirmed files, then commit:

```bash
git add <confirmed files>
git commit -m "docs(retro): apply process changes from retrospective"
```

---



## Step 9 — commit, log run, and push

Move the plan to the completed plans directory, append a run log entry, commit, and push:

```bash
git mv docs/exec-plans/active/<phase>-<slug>.md docs/exec-plans/completed/<phase>-<slug>.md
printf '| %s | %s | %s |\n' \
  "$(date -u +%Y-%m-%d)" "<phase>-<slug>" "${FLOW_PROVIDER:-claude}" >> docs/flow/runs-log.md
git add docs/exec-plans/completed/<phase>-<slug>.md docs/flow/runs-log.md
git commit -m "docs(plan): retrospective"
git push
```

---



## Step 9.5 — clean up run artifacts

Remove the per-phase run files and generated prompts that accumulated in `.flow/` during this
session:

```bash
rm -f .flow/*-run-*.json .flow/*-run-latest.json
rm -f .flow/logs/*.log 2>/dev/null || true
```

These files are untracked and not committed. Once the PR is merged they serve no purpose.
