# TF-2.5 Smoke Test Commands

All commands run from the **Garden Journal repo root**.
After completing each step, stop and ask the user which step to run next before proceeding.

---

## Step 0 — (re)generate combined prompts

Run whenever `context.md` or any file in `prompts/` changes:

```bash
for f in .flow/prompts/*.md; do
  role=$(basename "$f" .md)
  cat .flow/context.md "$f" > .flow/combined/${role}-combined.md
done
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
git checkout -b feature/<phase>-<slug>
```

---

## Step 1 — plan-writer (initial draft)

```bash
TS=$(date +%Y%m%d-%H%M%S)
claude -p "$(cat .flow/combined/plan-writer-combined.md)

Task: Write the plan for phase <phase> — <one-line description>." \
  --model claude-opus-4-8 \
  --output-format json \
  --permission-mode bypassPermissions \
  --allowedTools "Read,Edit(docs/exec-plans/active/<phase>-<slug>.md),Write(docs/exec-plans/active/<phase>-<slug>.md),Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git status *)" \
  > .flow/plan-writer-run-${TS}.json
ln -sf "plan-writer-run-${TS}.json" .flow/plan-writer-run-latest.json
```

---

## Step 2 — plan-reviewer

```bash
TS=$(date +%Y%m%d-%H%M%S)
claude -p "$(cat .flow/combined/plan-reviewer-combined.md)

Task: Review the plan at docs/exec-plans/active/<phase>-<slug>.md." \
  --model claude-sonnet-4-6 \
  --output-format json \
  --permission-mode bypassPermissions \
  --allowedTools "Read,Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git status *)" \
  > .flow/plan-reviewer-run-${TS}.json
ln -sf "plan-reviewer-run-${TS}.json" .flow/plan-reviewer-run-latest.json
```

Check the outcome:

```bash
jq -r '.result' .flow/plan-reviewer-run-latest.json | grep "^PLAN-REVIEW:"
```

If output is `PLAN-REVIEW: APPROVED`, proceed to Step 3.5. If `PLAN-REVIEW: ISSUES`, run Step 2.5.

---

## Step 2.5 — human gate for approval findings (conditional)

Run only if Step 2 returned `PLAN-REVIEW: ISSUES`.

Before running Step 3, read the findings and classify each one:

- **Mechanical fix** — the plan-writer can resolve it without human input (e.g. a missing §1
  entry, a consistency gap between sections). Pass straight to Step 3.
- **Approval finding** — the reviewer explicitly asks the human to confirm something (e.g. a
  scope addition outside the build-plan entry, an invariant change, a stop-and-ask departure).
  These must be surfaced to the human before the plan-writer can record them in §11.

For each approval finding, ask the human. Once all responses are collected, save them:

```bash
cat > .flow/human-responses.txt << 'EOF'
<finding text>
Human response: <response>

<next finding text, if any>
Human response: <response>
EOF
```

If there are no approval findings, skip writing `.flow/human-responses.txt` and run Step 3 with
the standard command.

---

## Step 3 — plan-writer (address-review loop)

Run only if Step 2.5 is complete (see Step 2.5).

If Step 2.5 produced no human responses (only mechanical fixes), use the standard command:

```bash
TS=$(date +%Y%m%d-%H%M%S)
claude -p "$(cat .flow/combined/plan-writer-combined.md)

The plan is at docs/exec-plans/active/<phase>-<slug>.md.
Address the following review comments:

$(jq -r '.result' .flow/plan-reviewer-run-latest.json)" \
  --model claude-opus-4-8 \
  --output-format json \
  --permission-mode bypassPermissions \
  --allowedTools "Read,Edit(docs/exec-plans/active/<phase>-<slug>.md),Write(docs/exec-plans/active/<phase>-<slug>.md),Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git status *)" \
  > .flow/plan-writer-revise-run-${TS}.json
ln -sf "plan-writer-revise-run-${TS}.json" .flow/plan-writer-revise-run-latest.json
```

If Step 2.5 produced human responses (`.flow/human-responses.txt` exists), append them to the prompt:

```bash
TS=$(date +%Y%m%d-%H%M%S)
claude -p "$(cat .flow/combined/plan-writer-combined.md)

The plan is at docs/exec-plans/active/<phase>-<slug>.md.
Address the following review comments:

$(jq -r '.result' .flow/plan-reviewer-run-latest.json)

Human responses to findings requiring approval:
$(cat .flow/human-responses.txt)" \
  --model claude-opus-4-8 \
  --output-format json \
  --permission-mode bypassPermissions \
  --allowedTools "Read,Edit(docs/exec-plans/active/<phase>-<slug>.md),Write(docs/exec-plans/active/<phase>-<slug>.md),Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git status *)" \
  > .flow/plan-writer-revise-run-${TS}.json
ln -sf "plan-writer-revise-run-${TS}.json" .flow/plan-writer-revise-run-latest.json
```

Return to Step 2. Repeat Steps 2.5–3 until Step 2 ends with `PLAN-REVIEW: APPROVED`.

---

## Step 3.5 — question-resolver (conditional — skip if §8 is empty)

Check whether §8 has any open questions first:

```bash
awk '/^## 8\. /,/^## 9\./' docs/exec-plans/active/<phase>-<slug>.md | grep "(Issue:"
```

If §8 is empty, skip to step 4. Otherwise run both passes below.

### Pass 1 — create issues and post proposals

```bash
TS=$(date +%Y%m%d-%H%M%S)
claude -p "$(cat .flow/combined/question-resolver-combined.md)

Task: Resolve all open questions in §8 of docs/exec-plans/active/<phase>-<slug>.md." \
  --model claude-opus-4-8 \
  --output-format json \
  --permission-mode bypassPermissions \
  --allowedTools "Read,Edit(docs/exec-plans/active/<phase>-<slug>.md),Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git status *),WebSearch,Bash(gh issue create *),Bash(gh issue view *),Bash(gh issue comment *),Bash(gh issue close *)" \
  > .flow/question-resolver-pass1-run-${TS}.json
ln -sf "question-resolver-pass1-run-${TS}.json" .flow/question-resolver-pass1-run-latest.json
```

Verify: a GitHub issue is created for each §8 question and its URL is recorded in §8; a proposal
comment is posted on each issue; §11 is not yet modified; marker is
`QUESTIONS-RESOLVED: NEEDS-HUMAN`.

### Human gate

Review each GitHub issue comment and approve, modify, or reject the proposal directly in the
issue thread.

### Pass 2 — write ratified decisions

```bash
TS=$(date +%Y%m%d-%H%M%S)
claude -p "$(cat .flow/combined/question-resolver-combined.md)

Task: Resolve all open questions in §8 of docs/exec-plans/active/<phase>-<slug>.md." \
  --model claude-opus-4-8 \
  --output-format json \
  --permission-mode bypassPermissions \
  --allowedTools "Read,Edit(docs/exec-plans/active/<phase>-<slug>.md),Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git status *),WebSearch,Bash(gh issue create *),Bash(gh issue view *),Bash(gh issue comment *),Bash(gh issue close *)" \
  > .flow/question-resolver-pass2-run-${TS}.json
ln -sf "question-resolver-pass2-run-${TS}.json" .flow/question-resolver-pass2-run-latest.json
```

Verify: each approved question has its D-N entry appended to §11, is removed from §8, and its
issue is closed. Marker is `QUESTIONS-RESOLVED: DONE` once §8 is empty.

If any §7 items are answered by the new decisions, run plan-writer once more to clear §7:

```bash
TS=$(date +%Y%m%d-%H%M%S)
claude -p "$(cat .flow/combined/plan-writer-combined.md)

Task: Clear §7 items now answered by decisions in §11 for docs/exec-plans/active/<phase>-<slug>.md." \
  --model claude-opus-4-8 \
  --output-format json \
  --permission-mode bypassPermissions \
  --allowedTools "Read,Edit(docs/exec-plans/active/<phase>-<slug>.md),Write(docs/exec-plans/active/<phase>-<slug>.md),Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git status *)" \
  > .flow/plan-writer-clear-s7-run-${TS}.json
ln -sf "plan-writer-clear-s7-run-${TS}.json" .flow/plan-writer-clear-s7-run-latest.json
```

---

## Step 4 — implementer

```bash
TS=$(date +%Y%m%d-%H%M%S)
claude -p "$(cat .flow/combined/implementer-combined.md)

Task: Implement the approved plan at docs/exec-plans/active/<phase>-<slug>.md." \
  --model claude-sonnet-4-6 \
  --output-format json \
  --permission-mode bypassPermissions \
  --allowedTools "Read,Edit,Write,Bash(git add *),Bash(git commit *),Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git status *),Bash(npm run lint),Bash(npm run test),Bash(npm run test:e2e),Bash(npm run build),Bash(npx tsc *)" \
  > .flow/implementer-run-${TS}.json
ln -sf "implementer-run-${TS}.json" .flow/implementer-run-latest.json
```

---

## Step 4.5 — Open PR

```bash
jq -r '.result' .flow/implementer-run-latest.json | grep -v "^IMPLEMENTER: DONE" > .flow/pr-body.md
git push -u origin $(git branch --show-current)
export PR_URL=$(gh pr create --title "<phase>: <slug>" --body "$(cat .flow/pr-body.md)")
export HEAD_SHA=$(git rev-parse HEAD)
echo "PR_URL=$PR_URL HEAD_SHA=$HEAD_SHA"
```

Verify: the PR description matches the implementer's output (minus the marker line); the diff is
visible on GitHub.

CI starts automatically on push and runs concurrently with Steps 5 and 6. If CI fails before
the reviewers finish, address the failure before proceeding to Step 7.

---

## Step 5 — pr-reviewer-a

Steps 5 and 6 are independent and can run simultaneously.

### Initial run (after step 4.5)

```bash
TS=$(date +%Y%m%d-%H%M%S)
claude -p "$(cat .flow/combined/pr-reviewer-a-combined.md)

Plan: docs/exec-plans/active/<phase>-<slug>.md
PR URL: $PR_URL
Base branch: main
Head SHA: $HEAD_SHA
Diff:
$(git diff main...$HEAD_SHA)
PR body:
$(jq -r '.result' .flow/implementer-run-latest.json)" \
  --model claude-opus-4-8 \
  --output-format json \
  --permission-mode bypassPermissions \
  --allowedTools "Read,Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git status *)" \
  > .flow/pr-reviewer-a-run-${TS}.json
ln -sf "pr-reviewer-a-run-${TS}.json" .flow/pr-reviewer-a-run-latest.json
```

### Re-run (after step 7 fix)

```bash
TS=$(date +%Y%m%d-%H%M%S)
claude -p "$(cat .flow/combined/pr-reviewer-a-combined.md)

Plan: docs/exec-plans/active/<phase>-<slug>.md
PR URL: $PR_URL
Base branch: main
Head SHA: $HEAD_SHA
Diff:
$(git diff main...$HEAD_SHA)
PR body:
$(cat .flow/fix-report.txt)" \
  --model claude-opus-4-8 \
  --output-format json \
  --permission-mode bypassPermissions \
  --allowedTools "Read,Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git status *)" \
  > .flow/pr-reviewer-a-run-${TS}.json
ln -sf "pr-reviewer-a-run-${TS}.json" .flow/pr-reviewer-a-run-latest.json
```

Post the output as a PR comment:

```bash
jq -r '.result' .flow/pr-reviewer-a-run-latest.json > .flow/pr-reviewer-a-output.txt
gh pr comment $PR_URL --body "$(cat .flow/pr-reviewer-a-output.txt)"
```

---

## Step 6 — pr-reviewer-b

Steps 5 and 6 are independent and can run simultaneously.

### Initial run (after step 4.5)

```bash
TS=$(date +%Y%m%d-%H%M%S)
claude -p "$(cat .flow/combined/pr-reviewer-b-combined.md)

Plan: docs/exec-plans/active/<phase>-<slug>.md
PR URL: $PR_URL
Base branch: main
Head SHA: $HEAD_SHA
Diff:
$(git diff main...$HEAD_SHA)
PR body:
$(jq -r '.result' .flow/implementer-run-latest.json)" \
  --model claude-sonnet-4-6 \
  --output-format json \
  --permission-mode bypassPermissions \
  --allowedTools "Read,Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git status *)" \
  > .flow/pr-reviewer-b-run-${TS}.json
ln -sf "pr-reviewer-b-run-${TS}.json" .flow/pr-reviewer-b-run-latest.json
```

### Re-run (after step 7 fix)

```bash
TS=$(date +%Y%m%d-%H%M%S)
claude -p "$(cat .flow/combined/pr-reviewer-b-combined.md)

Plan: docs/exec-plans/active/<phase>-<slug>.md
PR URL: $PR_URL
Base branch: main
Head SHA: $HEAD_SHA
Diff:
$(git diff main...$HEAD_SHA)
PR body:
$(cat .flow/fix-report.txt)" \
  --model claude-sonnet-4-6 \
  --output-format json \
  --permission-mode bypassPermissions \
  --allowedTools "Read,Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git status *)" \
  > .flow/pr-reviewer-b-run-${TS}.json
ln -sf "pr-reviewer-b-run-${TS}.json" .flow/pr-reviewer-b-run-latest.json
```

Post the output as a PR comment:

```bash
jq -r '.result' .flow/pr-reviewer-b-run-latest.json > .flow/pr-reviewer-b-output.txt
gh pr comment $PR_URL --body "$(cat .flow/pr-reviewer-b-output.txt)"
```

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
TS=$(date +%Y%m%d-%H%M%S)
claude -p "$(cat .flow/combined/fix-agent-combined.md)

Plan: docs/exec-plans/active/<phase>-<slug>.md
PR URL: $PR_URL
PR comments (all, in chronological order):
$(cat .flow/pr-comments.txt)" \
  --model claude-sonnet-4-6 \
  --output-format json \
  --permission-mode bypassPermissions \
  --allowedTools "Read,Edit,Write,Bash(git add *),Bash(git commit *),Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git status *),Bash(npm run lint),Bash(npm run test),Bash(npm run test:e2e),Bash(npm run build),Bash(npx tsc *)" \
  > .flow/fix-agent-run-${TS}.json
ln -sf "fix-agent-run-${TS}.json" .flow/fix-agent-run-latest.json
```

Push the new commits and post the fix report as a PR comment:

```bash
git push
jq -r '.result' .flow/fix-agent-run-latest.json > .flow/fix-report.txt
gh pr comment $PR_URL --body "$(cat .flow/fix-report.txt)"
```

If the marker is `FIX-RESULT: DONE`:

Ask the user to review `.flow/pr-comments.txt` for any remaining non-blocking items and confirm:
"Should the fix-agent address these before re-review, or proceed as-is?"

- If **yes**: re-run Step 7 with a scoped task — insert the line
  `"Task: Address only non-blocking comments from the review. Blocking items
  are already resolved — do not re-address them."` before the `Plan:` line
  in the fix-agent command — then continue.
- If **no**: proceed.

Then capture the new HEAD SHA before re-running steps 5 and 6:

```bash
export HEAD_SHA=$(git rev-parse HEAD)
```

Repeat until both reviewers emit `VERDICT: APPROVED`. Confirm with:

```bash
jq -r '.result' .flow/pr-reviewer-a-run-latest.json | grep "^VERDICT:"
jq -r '.result' .flow/pr-reviewer-b-run-latest.json | grep "^VERDICT:"
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
TS=$(date +%Y%m%d-%H%M%S)
claude -p "$(cat .flow/combined/retro-writer-combined.md)

Plan: docs/exec-plans/active/<phase>-<slug>.md
Base branch: main
Head SHA: $HEAD_SHA
PR comment history:
$(cat .flow/pr-comments.txt)" \
  --model claude-sonnet-4-6 \
  --output-format json \
  --permission-mode bypassPermissions \
  --allowedTools "Read,Edit(docs/exec-plans/active/<phase>-<slug>.md),Write(docs/exec-plans/active/<phase>-<slug>.md),Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git status *)" \
  > .flow/retro-writer-run-${TS}.json
ln -sf "retro-writer-run-${TS}.json" .flow/retro-writer-run-latest.json
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

## Step 9 — commit and push

Move the plan to the completed plans directory, commit, and push:

```bash
git mv docs/exec-plans/active/<phase>-<slug>.md docs/exec-plans/completed/<phase>-<slug>.md
git add docs/exec-plans/completed/<phase>-<slug>.md
git commit -m "docs(plan): retrospective"
git push
```
