import type { AIProvider, ProviderCallConfig, RawExtractionResult, UsageData } from './provider'
import type { ExtractionRequest } from './requestBuilder'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

interface ChatCompletion {
  choices?: Array<{
    message?: {
      tool_calls?: Array<{ function?: { arguments?: unknown } }>
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
  }
}

function parseEvents(args: unknown): unknown {
  if (typeof args !== 'string') return undefined

  try {
    const parsed = JSON.parse(args) as { events?: unknown } | null
    return parsed?.events
  } catch {
    // Let the orchestrator record usage before it validates the events.
    return undefined
  }
}

function mapUsage(raw: ChatCompletion['usage']): UsageData | null {
  if (raw == null) return null

  const fields = {
    prompt_tokens: raw.prompt_tokens,
    completion_tokens: raw.completion_tokens,
    total_tokens: raw.total_tokens,
    cache_read_input_tokens: raw.prompt_tokens_details?.cached_tokens,
  }
  const rawUsage: Record<string, number> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'number') rawUsage[key] = value
  }

  return {
    inputTokens: rawUsage.prompt_tokens ?? 0,
    outputTokens: rawUsage.completion_tokens ?? 0,
    rawUsage,
  }
}

export class OpenAIProvider implements AIProvider {
  async extract(request: ExtractionRequest, config: ProviderCallConfig): Promise<RawExtractionResult> {
    const { name, description, input_schema } = request.tool
    const body = {
      model: config.model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.userMessage },
      ],
      tools: [{
        type: 'function',
        function: { name, description, parameters: input_schema },
      }],
      tool_choice: { type: 'function', function: { name } },
    }

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`OpenAI API error ${response.status}: ${detail}`)
    }

    const data = await response.json() as ChatCompletion
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments
    return { events: parseEvents(args), usage: mapUsage(data.usage) }
  }
}
