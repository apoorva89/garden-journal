import { nanoid } from 'nanoid'
import type { CropType, EventReview } from '../db'
import type { ExtractedEvent } from './extractionSpec'

function resolveDate(eventDate: string | null, entryDate: string): string {
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || eventDate.slice(0, 4) !== entryDate.slice(0, 4)) {
    return entryDate
  }
  const parsed = new Date(`${eventDate}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === eventDate
    ? eventDate
    : entryDate
}

export function resolveExtractedEvents(
  events: ExtractedEvent[],
  roster: CropType[],
  labelMap: Record<string, string>,
  entryDate: string,
): EventReview[] {
  return events.map(extracted => ({
    id: nanoid(),
    status: 'pending',
    extracted,
    resolvedCropTypeId: extracted.eventType === 'general' || extracted.matchedRosterName === null
      ? null
      : roster.find(crop => crop.name.trim().toLowerCase() === extracted.matchedRosterName!.trim().toLowerCase())?.id ?? null,
    resolvedLinkedProblemId: extracted.linkedProblemRef !== null && Object.hasOwn(labelMap, extracted.linkedProblemRef)
      ? labelMap[extracted.linkedProblemRef]
      : null,
    resolvedInstanceId: null,
    resolvedDate: resolveDate(extracted.eventDate, entryDate),
  }))
}
