function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${field} must be a nonempty string`);
  }
}

export function normalizeOutput({
  provider,
  role,
  timestamp,
  exitCode,
  output,
}) {
  if (provider !== 'claude' && provider !== 'codex') {
    throw new TypeError('provider must be claude or codex');
  }
  requireText(role, 'role');

  if (
    typeof timestamp !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(timestamp) ||
    !Number.isFinite(Date.parse(timestamp)) ||
    new Date(timestamp).toISOString() !==
      timestamp.replace(/Z$/, timestamp.includes('.') ? 'Z' : '.000Z')
  ) {
    throw new TypeError('timestamp must be a valid ISO 8601 UTC timestamp');
  }
  if (!Number.isInteger(exitCode) || exitCode < 0 || exitCode > 255) {
    throw new TypeError('exitCode must be an integer from 0 to 255');
  }
  requireText(output, 'native output');

  let result = output;
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
  }
  requireText(result, 'result');
  return {
    schema_version: 1, provider, role, timestamp,
    exit_code: exitCode, result,
  };
}
