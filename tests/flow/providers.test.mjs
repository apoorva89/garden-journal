import assert from 'node:assert/strict';
import test from 'node:test';
import { providerCommand } from '../../scripts/flow/providers.mjs';

const plan = 'docs/exec-plans/active/my-plan.md';
const gitTools = [
  'Bash(git diff *)', 'Bash(git log *)',
  'Bash(git show *)', 'Bash(git status *)',
];
const reviewRoles = ['plan-reviewer', 'pr-reviewer-a', 'pr-reviewer-b'];
const writingRoles = ['plan-writer', 'retro-writer'];
const implRoles = ['implementer', 'fix-agent'];
const roles = [...reviewRoles, ...writingRoles, ...implRoles, 'question-resolver'];
const opus = ['plan-writer', 'question-resolver', 'pr-reviewer-a'];
const stubRoots = ['/repo/.git'];

function value(command, flag) {
  const index = command.indexOf(flag);
  assert.notEqual(index, -1, `Missing ${flag}`);
  return command[index + 1];
}

for (const role of roles) {
  test(`claude ${role}: preserves model and explicit tool permissions`, () => {
    const command = providerCommand({ provider: 'claude', role, plan, writableRoots: stubRoots });
    assert.equal(command[0], 'claude');
    assert.ok(command.includes('-p'));
    assert.equal(value(command, '--output-format'), 'json');
    assert.equal(value(command, '--permission-mode'), 'dontAsk');
    assert.equal(value(command, '--model'),
      opus.includes(role) ? 'claude-opus-4-8' : 'claude-sonnet-4-6');
    const tools = value(command, '--allowedTools').split(',');
    assert.ok(tools.includes('Read'));
    for (const tool of gitTools) assert.ok(tools.includes(tool));
    if (reviewRoles.includes(role)) {
      assert.deepEqual(tools, ['Read', ...gitTools]);
      assert.equal(value(command, '--tools'), 'Read,Bash');
    } else if (writingRoles.includes(role)) {
      assert.ok(tools.includes(`Edit(${plan})`));
      assert.ok(tools.includes(`Write(${plan})`));
      assert.ok(!tools.includes('Edit'));
    } else if (role === 'question-resolver') {
      assert.ok(tools.includes(`Edit(${plan})`));
      assert.ok(tools.includes('WebSearch'));
      assert.ok(tools.includes('Bash(gh issue comment *)'));
    } else {
      assert.ok(tools.includes('Edit') && tools.includes('Write'));
      assert.ok(tools.includes('Bash(npm run test)'));
      assert.ok(tools.includes('Bash(git commit *)'));
    }
    assert.ok(!command.includes('bypassPermissions'));
  });

  test(`codex ${role}: uses the appropriate sandbox and flags`, () => {
    const command = providerCommand({ provider: 'codex', role, plan, writableRoots: stubRoots });
    assert.deepEqual(command.slice(0, 2), ['codex', 'exec']);
    assert.equal(value(command, '--sandbox'),
      reviewRoles.includes(role) ? 'read-only' : 'workspace-write');
    assert.ok(command.includes('approval_policy="never"'));
    assert.ok(!command.includes('--dangerously-bypass-approvals-and-sandbox'));
    assert.ok(!command.includes('--model'));

    // Scoping guard: impl roles get network + writable_roots; question-resolver gets
    // network only (needs gh api.github.com access but never commits); others get neither.
    const hasNetworkAccess = command.some((arg) => arg.includes('network_access'));
    const hasWritableRoots = command.some((arg) => arg.includes('writable_roots'));
    if (implRoles.includes(role)) {
      assert.ok(hasNetworkAccess, 'impl role must have network_access');
      assert.ok(hasWritableRoots, 'impl role must have writable_roots');
    } else if (role === 'question-resolver') {
      assert.ok(hasNetworkAccess, 'question-resolver must have network_access for gh');
      assert.ok(!hasWritableRoots, 'question-resolver must not have writable_roots');
    } else {
      assert.ok(!hasNetworkAccess, 'non-impl role must not have network_access');
      assert.ok(!hasWritableRoots, 'non-impl role must not have writable_roots');
    }
  });
}

test('supports an explicit model override', () => {
  for (const provider of ['claude', 'codex']) {
    assert.equal(value(providerCommand({
      provider, role: 'pr-reviewer-b', model: 'chosen-model', writableRoots: stubRoots,
    }), '--model'), 'chosen-model');
  }
});

test('rejects unknown providers, roles, unsafe plan paths, and missing writableRoots', () => {
  for (const options of [
    { provider: 'other', role: 'pr-reviewer-b' },
    { provider: 'codex', role: 'unknown' },
    { provider: 'claude', role: 'plan-writer' },
    { provider: 'claude', role: 'plan-writer', plan: '../outside.md' },
    // impl role under codex without writableRoots must throw
    { provider: 'codex', role: 'implementer', plan },
  ]) assert.throws(() => providerCommand(options));
});
