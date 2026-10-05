@AGENTS.md

# Change Workflow

Follow these steps for every file change, without exception:

1. **New branch first.** Before any edit, create a new branch off the latest main:
   `git checkout main && git pull && git checkout -b <type>/<name>`
   Use feat/fix/chore/docs prefix.

2. **Show diff in editor.** Call the Edit or Write tool immediately and silently.
   Do NOT include any diff, code block, or description of the proposed change in
   your chat response before calling the tool — the tool surfaces the diff in the
   editor for approval. At most one sentence before the tool call (e.g. "Editing
   `lib/db.ts`").

3. **Commit, then open a PR.** After the user approves and the commit is made,
   immediately open a GitHub PR. Do not wait to be asked.

4. **Post-merge cleanup.** PRs are merged via the GitHub UI. Once the user signals
   the merge is done:
   `git checkout main && git pull && git branch -d <branch>`
   Delete the remote branch too if it wasn't auto-deleted by GitHub.
