import { z } from 'zod'

export const ExtractedEventSchema = z.object({
  eventType: z.enum(['observation', 'problem', 'fix', 'nursery_pickup', 'harvest', 'lesson', 'general']),
  matchedRosterName: z.string().nullable(),
  linkedProblemRef: z.string().nullable(),
  notes: z.string(),
  eventDate: z.string().nullable(),
  nurseryName: z.string().nullable(),
  variety: z.string().nullable(),
})

export type ExtractedEvent = z.infer<typeof ExtractedEventSchema>
