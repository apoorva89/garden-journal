import type { ExtractionRequest } from './requestBuilder'
import { PROVIDER_ID_ANTHROPIC } from './providerConfig'
import { AnthropicProvider } from './anthropicProvider'

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
  throw new Error(`AI provider not implemented: ${providerId}`)
}
