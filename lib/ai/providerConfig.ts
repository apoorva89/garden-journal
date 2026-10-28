export interface ProviderConfig {
  id: string
  label: string
  models: string[]
  keyPlaceholder: string
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    models: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5-20251001'],
    keyPlaceholder: 'sk-ant-...',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini'],
    keyPlaceholder: 'sk-...',
  },
]

export function getProviderById(id: string): ProviderConfig | undefined {
  return PROVIDERS.find((p) => p.id === id)
}

export function getModelsForProvider(providerId: string): string[] {
  return getProviderById(providerId)?.models ?? []
}
