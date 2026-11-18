import 'fake-indexeddb/auto'
import { expect, test } from '@playwright/test'
import { IDBFactory } from 'fake-indexeddb'
import { z } from 'zod'
import { ExtractedEventSchema } from '../lib/ai/extractionSpec'
import { buildExtractionRequest } from '../lib/ai/requestBuilder'
import { openGardenDB } from '../lib/db'
import type { Settings } from '../lib/db'
import { runExtraction } from '../lib/orchestrator/ai'

const MODEL = 'gpt-4o-mini'
const ENTRY_ID = 'openai-integration-entry'

test('live OpenAI extraction: one real request, validated events, one usage log', async () => {
  const apiKey = process.env.OPENAI_API_KEY
  test.skip(!apiKey, 'OPENAI_API_KEY not set')
  if (!apiKey) return

  const database = await openGardenDB(new IDBFactory())
  const realFetch = globalThis.fetch
  let requestCount = 0

  try {
    globalThis.fetch = (...args) => {
      requestCount += 1
      return realFetch(...args)
    }

    const { request } = buildExtractionRequest({
      entryText: 'Harvested three ripe Roma tomatoes.',
      entryDate: '2026-11-05',
      nextSeasonNote: '',
      roster: [{ id: 'ct-tomato', name: 'Tomatoes', lessons: [] }],
      openProblems: [],
    })
    const settings: Settings = {
      locationName: 'Integration Test Garden',
      lastFrostDate: null,
      latitude: null,
      longitude: null,
      aiProvider: 'openai',
      aiModel: MODEL,
      apiKeys: { openai: apiKey },
    }

    const events = await runExtraction({ entryId: ENTRY_ID, request, settings, database })

    expect(requestCount).toBe(1)
    expect(events.length).toBeGreaterThan(0)
    expect(z.array(ExtractedEventSchema).safeParse(events).success).toBe(true)
    const logs = await database.getAllFromIndex('apiUsageLogs', 'by-entryId', ENTRY_ID)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ model: MODEL, provider: 'openai' })
    expect(logs[0].inputTokens).toBeGreaterThan(0)
    expect(logs[0].outputTokens).toBeGreaterThan(0)
  } finally {
    globalThis.fetch = realFetch
    database.close()
  }
})
