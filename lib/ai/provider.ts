import type { ExtractionRequest } from './requestBuilder'
import { PROVIDER_ID_ANTHROPIC, PROVIDER_ID_OPENAI } from './providerConfig'
import { AnthropicProvider } from './anthropicProvider'
import { OpenAIProvider } from './openaiProvider'

export interface UsageData {
  inputTokens: number
  outputTokens: number
  rawUsage: Record<string, number>
}

export interface RawExtractionResult {
  events: unknown
  usage: UsageData | null
}

export interface ProviderCallConfig {
  model: string
  apiKey: string
}

export interface AIProvider {
  extract(request: ExtractionRequest, config: ProviderCallConfig): Promise<RawExtractionResult>
}

export class StubAIProvider implements AIProvider {
  async extract(): Promise<RawExtractionResult> {
    throw new Error('not implemented')
  }
}

export function getProvider(providerId: string): AIProvider {
  if (providerId === PROVIDER_ID_ANTHROPIC) {
    return new AnthropicProvider()
  }
  if (providerId === PROVIDER_ID_OPENAI) {
    return new OpenAIProvider()
  }
  throw new Error(`AI provider not implemented: ${providerId}`)
}
