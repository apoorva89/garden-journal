const gitTools = [
  'Bash(git diff *)', 'Bash(git log *)',
  'Bash(git show *)', 'Bash(git status *)',
];
const reviewRoles = new Set([
  'plan-reviewer', 'pr-reviewer-a', 'pr-reviewer-b',
]);
const writingRoles = new Set(['plan-writer', 'retro-writer']);
const implementationRoles = new Set(['implementer', 'fix-agent']);
const opusRoles = new Set([
  'plan-writer', 'question-resolver', 'pr-reviewer-a',
]);

export const executionRoles = Object.freeze([
  ...reviewRoles, ...writingRoles, ...implementationRoles, 'question-resolver',
]);

export function providerCommand({ provider, role, plan, model }) {
  const knownRole = executionRoles.includes(role);
  if (!knownRole) throw new TypeError(`Unknown execution role: ${role}`);
  if (provider !== 'claude' && provider !== 'codex') {
    throw new TypeError('provider must be claude or codex');
  }
  if (model !== undefined && (typeof model !== 'string' || !model.trim())) {
    throw new TypeError('model must be a nonempty string');
  }
  if (plan !== undefined &&
      (typeof plan !== 'string' ||
       !/^docs\/exec-plans\/active\/[a-zA-Z0-9][a-zA-Z0-9-]*\.md$/.test(plan))) {
    throw new TypeError('plan must name a Markdown file in docs/exec-plans/active');
  }
  if ((writingRoles.has(role) || role === 'question-resolver') && !plan) {
    throw new TypeError(`${role} requires a plan path`);
  }

  if (provider === 'codex') {
    return [
      'codex', 'exec',
      '--sandbox', reviewRoles.has(role) ? 'read-only' : 'workspace-write',
      '-c', 'approval_policy="never"',
      '--ephemeral',
      ...(model ? ['--model', model] : []),
      '-',
    ];
  }

  let tools = ['Read', ...gitTools];
  if (writingRoles.has(role)) {
    tools = ['Read', `Edit(${plan})`, `Write(${plan})`, ...gitTools];
  } else if (role === 'question-resolver') {
    tools = [
      'Read', `Edit(${plan})`, ...gitTools, 'WebSearch',
      'Bash(gh issue create *)', 'Bash(gh issue view *)',
      'Bash(gh issue comment *)', 'Bash(gh issue close *)',
    ];
  } else if (implementationRoles.has(role)) {
    tools = [
      'Read', 'Edit', 'Write',
      'Bash(git add *)', 'Bash(git commit *)', ...gitTools,
      'Bash(npm run lint)', 'Bash(npm run test)',
      'Bash(npm run test:e2e)', 'Bash(npm run build)',
      'Bash(npx tsc *)',
    ];
  }
  const toolTypes = [...new Set(tools.map((tool) => tool.split('(')[0]))];
  return [
    'claude', '-p',
    '--model', model || (
      opusRoles.has(role) ? 'claude-opus-4-8' : 'claude-sonnet-4-6'
    ),
    '--output-format', 'json',
    '--permission-mode', 'dontAsk',
    '--tools', toolTypes.join(','),
    '--allowedTools', tools.join(','),
    '--strict-mcp-config',
    '--mcp-config', '{"mcpServers":{}}',
  ];
}
