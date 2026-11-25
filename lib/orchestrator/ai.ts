import { z } from 'zod'
import { getProvider } from '../ai/provider'
import { ExtractedEventSchema } from '../ai/extractionSpec'
import { resolveExtractedEvents } from '../ai/eventResolver'
import { buildExtractionRequest } from '../ai/requestBuilder'
import {
  addApiUsageLog,
  getAllCropTypes,
  getAllCropInstances,
  getAllOpenProblems,
  savePendingExtraction,
} from '../db'
import type { ExtractionRequest } from '../ai/requestBuilder'
import type { ExtractedEvent } from '../ai/extractionSpec'
import type { Settings, GardenDB, JournalEntry, PendingExtraction } from '../db'

export async function runExtraction(params: {
  entryId: string
  request: ExtractionRequest
  settings: Settings
  database?: GardenDB
}): Promise<{ events: ExtractedEvent[]; usage: PendingExtraction['usage'] }> {
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

  return {
    events: z.array(ExtractedEventSchema).parse(raw.events),
    usage: raw.usage && {
      inputTokens: raw.usage.inputTokens,
      outputTokens: raw.usage.outputTokens,
    },
  }
}

export async function runEntryExtraction(params: {
  entry: JournalEntry
  settings: Settings
  database?: GardenDB
}): Promise<PendingExtraction> {
  const { entry, settings, database } = params
  const [roster, instances, problems] = await Promise.all([
    getAllCropTypes(database),
    getAllCropInstances(database),
    getAllOpenProblems(Number(entry.date.slice(0, 4)), database),
  ])
  const cropNames = new Map(roster.map(crop => [crop.id, crop.name]))
  const instanceTypes = new Map(instances.map(instance => [instance.id, instance.cropTypeId]))
  const openProblems = problems.map(problem => ({
    ...problem,
    cropName: cropNames.get(instanceTypes.get(problem.cropInstanceId) ?? '') ?? 'General',
  }))
  const { request, labelMap } = buildExtractionRequest({
    entryText: entry.text,
    entryDate: entry.date,
    nextSeasonNote: entry.nextSeasonNote,
    roster,
    openProblems,
  })
  const { events, usage } = await runExtraction({ entryId: entry.id, request, settings, database })
  return savePendingExtraction({
    entryId: entry.id,
    events: resolveExtractedEvents(events, roster, labelMap, entry.date),
    usage,
    createdAt: new Date().toISOString(),
  }, database)
}
