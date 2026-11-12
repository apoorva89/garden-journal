import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import {
  renameSync, symlinkSync, writeFileSync,
} from 'node:fs';
import {
  mkdir, mkdtemp, open, readFile, writeFile,
} from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { normalizeOutput } from './normalize.mjs';
import { executionRoles, providerCommand } from './providers.mjs';

function safeName(value, field) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]*$/.test(value)) {
    throw new TypeError(`${field} must contain lowercase letters, digits, or hyphens`);
  }
  return value;
}

function extractModel(command) {
  const idx = command.indexOf('--model');
  return idx !== -1 && idx + 1 < command.length ? command[idx + 1] : null;
}

function extractPhase(plan) {
  if (!plan) return null;
  const match = /^(\w+-\d+)-/.exec(basename(plan, '.md'));
  return match ? match[1] : null;
}

export async function runAgent(options, dependencies = {}) {
  const {
    provider, role, task,
    artifactName = role,
    root = process.cwd(),
  } = options;
  const { command, now = () => new Date(), onStart = () => {} } = dependencies;
  safeName(role, 'role');
  safeName(artifactName, 'artifactName');
  if (provider !== 'claude' && provider !== 'codex') {
    throw new TypeError('provider must be claude or codex');
  }
  if (typeof task !== 'string' || !task.trim()) {
    throw new TypeError('task must be a nonempty string');
  }
  if (!Array.isArray(command) || !command.length ||
      command.some((part) => typeof part !== 'string' || !part)) {
    throw new TypeError('command must be a nonempty array of strings');
  }

  const workingRoot = resolve(root);
  const flow = join(workingRoot, '.flow');
  const logRoot = join(flow, 'logs');
  await mkdir(logRoot, { recursive: true });
  const timestamp = now().toISOString();
  const stamp = timestamp.slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  // mkdtemp reserves each run exclusively, including simultaneous launches.
  const logDirectory = await mkdtemp(
    join(logRoot, `${artifactName}-run-${stamp}-`),
  );
  const stem = basename(logDirectory);
  const artifact = join(flow, `${stem}.json`);
  const logs = {
    stdout: join(logDirectory, 'stdout.log'),
    stderr: join(logDirectory, 'stderr.log'),
    final: join(logDirectory, 'final.txt'),
  };
  const diagnostic = join(logDirectory, 'failure.json');
  const model = extractModel(command);
  const phase = extractPhase(options.plan);
  const relLogDir = relative(workingRoot, logDirectory);
  let processExitCode = null;
  let signal = null;
  let exitCode = 1;
  let endedAt = null;

  try {
    const combined = await readFile(
      join(flow, 'combined', `${role}-combined.md`), 'utf8',
    );
    const prompt = `${combined}\n\n${task}`;
    const args = provider === 'codex'
      ? [...command.slice(1), '--output-last-message', logs.final]
      : command.slice(1);
    const stdout = await open(logs.stdout, 'wx');
    let stderr;
    let outcome;
    try {
      stderr = await open(logs.stderr, 'wx');
      onStart({ role, provider, logDirectory });
      outcome = await new Promise((resolveChild, rejectChild) => {
        const child = spawn(command[0], args, {
          cwd: workingRoot,
          stdio: ['pipe', stdout.fd, stderr.fd],
          shell: false,
        });
        let failure;
        child.once('error', (error) => { failure = error; });
        child.stdin.on('error', (error) => {
          if (error.code !== 'EPIPE') failure = error;
        });
        child.once('close', (code, childSignal) => {
          if (failure) rejectChild(failure);
          else resolveChild({ code, signal: childSignal });
        });
        child.stdin.end(prompt);
      });
    } finally {
      endedAt = now().toISOString();
      await stdout.close();
      if (stderr) await stderr.close();
    }
    processExitCode = outcome.code;
    signal = outcome.signal;
    if (signal) {
      exitCode = 128 + (constants.signals[signal] || 1);
      throw new Error(`Agent terminated by ${signal}`);
    }
    if (processExitCode !== 0) {
      exitCode = processExitCode ?? 1;
      throw new Error(`Agent exited with status ${processExitCode}`);
    }
    const output = await readFile(
      provider === 'claude' ? logs.stdout : logs.final, 'utf8',
    );
    const envelope = normalizeOutput({
      provider, role, timestamp, endedAt, exitCode: processExitCode, output,
      runId: stem, phase, model, logDirectory: relLogDir,
    });
    // Synchronous publication prevents in-process interleaving. Renaming
    // a completed symlink is atomic for readers and other runner processes.
    writeFileSync(artifact, `${JSON.stringify(envelope, null, 2)}\n`, { flag: 'wx' });
    const temporaryLink = join(flow, `.${stem}-latest.tmp`);
    symlinkSync(basename(artifact), temporaryLink);
    renameSync(temporaryLink, join(flow, `${artifactName}-run-latest.json`));
    return {
      exitCode: 0, artifact, logs,
      summary: `Completed ${role} (${provider}): ${artifact}; logs: ${logDirectory}`,
    };
  } catch (error) {
    endedAt = endedAt ?? now().toISOString();
    await writeFile(diagnostic, `${JSON.stringify({
      provider, role, phase, model, timestamp, ended_at: endedAt,
      process_exit_code: processExitCode,
      signal, error: error.message, logs,
    }, null, 2)}\n`, { flag: 'wx' });
    return {
      exitCode, diagnostic, logs,
      summary: `Failed ${role} (${provider}), status ${exitCode}: ${diagnostic}`,
    };
  }
}

const usage = `Usage: node scripts/flow/run.mjs --role <role> [options]
       printf '%s' 'Task text' | node scripts/flow/run.mjs --role <role> [options]

Options:
  --role <role>            Required execution role (listed below).
  --provider <provider>    claude (default) or codex.
  --task <text>            Nonempty task text; omit to read UTF-8 task text from stdin.
  --plan <path>            Required for plan-writer, retro-writer, question-resolver.
                          Must be docs/exec-plans/active/<name>.md.
  --model <model>          Override the provider model; otherwise use role/CLI defaults.
  --artifact-name <name>   Optional artifact name (default: role); lowercase letters,
                          digits, and hyphens, starting with a letter.
  --help, -h              Print this help without reading prompts or starting a provider.

Execution roles:
  ${executionRoles.join(', ')}

Run from the Garden Journal repo root. Combined prompts are read from .flow/combined/.
`;

async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: 'boolean', short: 'h' },
      provider: { type: 'string', default: 'claude' },
      role: { type: 'string' },
      plan: { type: 'string' },
      model: { type: 'string' },
      'artifact-name': { type: 'string' },
      task: { type: 'string' },
    },
    allowPositionals: false,
  });
  if (values.help) {
    console.log(usage);
    return;
  }
  if (!values.role) throw new Error('--role is required; choose a supported execution role');
  const command = providerCommand(values);
  if (values['artifact-name'] !== undefined) {
    safeName(values['artifact-name'], 'artifactName');
  }
  let task = values.task;
  if (task === undefined) {
    if (process.stdin.isTTY) {
      throw new Error('Provide --task or pipe the task through stdin');
    }
    task = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) task += chunk;
  }
  if (!task.trim()) {
    throw new Error('Provide a nonempty --task value or pipe task text through stdin');
  }
  const execution = await runAgent({
    ...values,
    artifactName: values['artifact-name'],
    task,
  }, {
    command,
    onStart: ({ role, provider, logDirectory }) => {
      console.log(`Starting ${role} (${provider}); logs: ${logDirectory}`);
    },
  });
  if (execution.exitCode === 0) console.log(execution.summary);
  else console.error(execution.summary);
  process.exitCode = execution.exitCode;
}

if (process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Flow runner: ${error.message}`);
    console.error('Run "node scripts/flow/run.mjs --help" for usage and supported roles.');
    process.exitCode = 1;
  });
}
