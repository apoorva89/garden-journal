import { test, expect } from '@playwright/test'
import { IDBFactory } from 'fake-indexeddb'
import { z } from 'zod'
import { openGardenDB } from '../lib/db'
import { runExtraction } from '../lib/orchestrator/ai'
import { buildExtractionRequest } from '../lib/ai/requestBuilder'
import { ExtractedEventSchema } from '../lib/ai/extractionSpec'
import type { Settings } from '../lib/db'

// Hard-coded per human reviewer approval — test code only, not production source.
const MODEL = 'claude-haiku-4-5-20251001'
const ENTRY_ID = 'integration-test-entry-01'

test('live extraction returns valid events and logs ApiUsageLog', async () => {
  test.skip(!process.env.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY not set')

  const apiKey = process.env.ANTHROPIC_API_KEY!
  const db = await openGardenDB(new IDBFactory())

  const { request } = buildExtractionRequest({
    entryText: 'Planted tomatoes in the raised bed. Looking healthy.',
    entryDate: '2026-11-05',
    nextSeasonNote: '',
    roster: [{ id: 'ct-01', name: 'Tomatoes', lessons: [] }],
    openProblems: [],
  })

  const settings: Settings = {
    locationName: 'Integration Test Garden',
    lastFrostDate: null,
    latitude: null,
    longitude: null,
    aiProvider: 'anthropic',
    aiModel: MODEL,
    apiKeys: { anthropic: apiKey },
  }

  const events = await runExtraction({
    entryId: ENTRY_ID,
    request,
    settings,
    database: db,
  })

  // (a) Returned events validate correctly against ExtractedEventSchema
  expect(z.array(ExtractedEventSchema).safeParse(events).success).toBe(true)
  expect(events.length).toBeGreaterThan(0)

  // (b) Exactly one ApiUsageLog with correct token counts
  const logs = await db.getAllFromIndex('apiUsageLogs', 'by-entryId', ENTRY_ID)
  expect(logs).toHaveLength(1)
  expect(logs[0].inputTokens).toBeGreaterThan(0)
  expect(logs[0].outputTokens).toBeGreaterThan(0)
  expect(logs[0].model).toBe(MODEL)
  expect(logs[0].provider).toBe('anthropic')
})
