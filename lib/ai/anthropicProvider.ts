import type { AIProvider, ProviderCallConfig, RawExtractionResult, UsageData } from './provider'
import type { ExtractionRequest } from './requestBuilder'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const MAX_TOKENS = 4096

export class AnthropicProvider implements AIProvider {
  async extract(request: ExtractionRequest, config: ProviderCallConfig): Promise<RawExtractionResult> {
    const body = {
      model: config.model,
      max_tokens: MAX_TOKENS,
      system: request.system,
      tools: [request.tool],
      tool_choice: { type: 'tool', name: request.tool.name },
      messages: [{ role: 'user', content: request.userMessage }],
    }

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': ANTHROPIC_VERSION,
        'x-api-key': config.apiKey,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Anthropic API error ${response.status}: ${text}`)
    }

    const data = await response.json()

    const toolBlock = ((data.content ?? []) as Array<{ type: string; input?: unknown }>)
      .find((b) => b.type === 'tool_use')

    const events: unknown = toolBlock?.input != null
      ? (toolBlock.input as Record<string, unknown>).events
      : undefined

    let usage: UsageData | null = null
    if (data.usage != null) {
      const raw = data.usage as Record<string, number>
      usage = {
        inputTokens: raw.input_tokens ?? 0,
        outputTokens: raw.output_tokens ?? 0,
        rawUsage: raw,
      }
    }

    return { events, usage }
  }
}
