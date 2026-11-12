function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${field} must be a nonempty string`);
  }
}

function validIso(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() ===
      value.replace(/Z$/, value.includes('.') ? 'Z' : '.000Z')
  );
}

export function normalizeOutput({
  provider,
  role,
  timestamp,
  endedAt = null,
  exitCode,
  output,
  runId = null,
  phase = null,
  model = null,
  logDirectory = null,
}) {
  if (provider !== 'claude' && provider !== 'codex') {
    throw new TypeError('provider must be claude or codex');
  }
  requireText(role, 'role');

  if (!validIso(timestamp)) {
    throw new TypeError('timestamp must be a valid ISO 8601 UTC timestamp');
  }
  if (!Number.isInteger(exitCode) || exitCode < 0 || exitCode > 255) {
    throw new TypeError('exitCode must be an integer from 0 to 255');
  }
  requireText(output, 'native output');

  let result = output;
  let tokenUsage = null;
  let costUsd = null;
  let providerDurationMs = null;

  if (provider === 'claude') {
    let native;
    try {
      native = JSON.parse(output);
    } catch {
      throw new TypeError('Claude output must be valid JSON');
    }
    if (!native || Array.isArray(native) || typeof native !== 'object') {
      throw new TypeError('Claude output must be a JSON object');
    }
    if (native.is_error === true) {
      throw new Error('Claude reported an execution error');
    }
    result = native.result;
    if (native.usage && typeof native.usage === 'object' && !Array.isArray(native.usage)) {
      tokenUsage = native.usage;
    }
    if (typeof native.cost_usd === 'number') costUsd = native.cost_usd;
    if (typeof native.duration_ms === 'number') providerDurationMs = native.duration_ms;
  }
  requireText(result, 'result');

  const wallMs =
    endedAt !== null && validIso(endedAt)
      ? Date.parse(endedAt) - Date.parse(timestamp)
      : null;

  return {
    schema_version: 2,
    run_id: runId ?? null,
    provider,
    role,
    phase: phase ?? null,
    model: model ?? null,
    started_at: timestamp,
    ended_at: endedAt ?? null,
    wall_ms: wallMs,
    exit_code: exitCode,
    ...(tokenUsage !== null && { token_usage: tokenUsage }),
    ...(costUsd !== null && { cost_usd: costUsd }),
    ...(providerDurationMs !== null && { provider_duration_ms: providerDurationMs }),
    log_directory: logDirectory ?? null,
    result,
  };
}
