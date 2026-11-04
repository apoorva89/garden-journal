import { z } from 'zod'
import { getProvider } from '../ai/provider'
import { ExtractedEventSchema } from '../ai/extractionSpec'
import { addApiUsageLog } from '../db'
import type { ExtractionRequest } from '../ai/requestBuilder'
import type { ExtractedEvent } from '../ai/extractionSpec'
import type { Settings, GardenDB } from '../db'

export async function runExtraction(params: {
  entryId: string
  request: ExtractionRequest
  settings: Settings
  database?: GardenDB
}): Promise<ExtractedEvent[]> {
  const { entryId, request, settings, database } = params

  const provider = getProvider(settings.aiProvider)
  const model = settings.aiModel
  const apiKey = settings.apiKeys[settings.aiProvider] ?? ''

  const raw = await provider.extract(request, { model, apiKey })

  if (raw.usage != null) {
    await addApiUsageLog(
      {
        entryId,
        date: new Date().toISOString(),
        provider: settings.aiProvider,
        model,
        inputTokens: raw.usage.inputTokens,
        outputTokens: raw.usage.outputTokens,
        rawUsage: raw.usage.rawUsage,
      },
      database,
    )
  }

  return z.array(ExtractedEventSchema).parse(raw.events)
}
