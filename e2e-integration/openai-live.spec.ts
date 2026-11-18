import 'fake-indexeddb/auto'
import { expect, test } from '@playwright/test'
import { IDBFactory } from 'fake-indexeddb'
import { z } from 'zod'
import { ExtractedEventSchema } from '../lib/ai/extractionSpec'
import { buildExtractionRequest } from '../lib/ai/requestBuilder'
import { openGardenDB } from '../lib/db'
import type { CropEvent, Settings } from '../lib/db'
import { runExtraction } from '../lib/orchestrator/ai'

// This manually triggered test incurs OpenAI API charges.
const MODEL = 'gpt-4o-mini'
const ENTRY_ID = 'openai-integration-entry'
const ENTRY_DATE = '2026-11-05'

const ENTRY_TEXT = [
  'Harvested three ripe Roma tomatoes.',
  'White powdery patches appeared on the zucchini leaves.',
  'Small heads are forming on the broccoli plants.',
  'Watered the garden this morning.',
  "Bought a Sungold tomato plant from Swanson's Nursery.",
  'Sprayed the cucumber leaves with neem oil to treat the aphids I noticed last week.',
].join(' ')

const EXISTING_PROBLEM_ID = 'existing-cucumber-aphids-01'
const existingCucumberProblem: CropEvent & { cropName: string } = {
  id: EXISTING_PROBLEM_ID,
  cropInstanceId: 'cucumber-instance-01',
  cropName: 'Cucumber',
  date: '2026-10-30',
  year: 2026,
  type: 'problem',
  notes: 'Aphids on cucumber leaves.',
  linkedProblemId: null,
  photos: [],
  weatherC: null,
  weatherIcon: null,
  resolved: false,
}

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

    const { request, labelMap } = buildExtractionRequest({
      entryText: ENTRY_TEXT,
      entryDate: ENTRY_DATE,
      nextSeasonNote: '',
      roster: [
        { id: 'ct-tomato', name: 'Tomatoes', lessons: [] },
        { id: 'ct-zucchini', name: 'Zucchini', lessons: [] },
        { id: 'ct-broccoli', name: 'Broccoli', lessons: [] },
        { id: 'ct-cucumber', name: 'Cucumber', lessons: [] },
      ],
      openProblems: [existingCucumberProblem],
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
    console.log('\n=== EXTRACTED GARDEN EVENTS ===')
    console.log(JSON.stringify(events, null, 2))

    // Integration contract: a successful real request returns valid events.
    expect(z.array(ExtractedEventSchema).safeParse(events).success).toBe(true)
    expect(events.length).toBeGreaterThan(0)

    // Inspect usage AFTER reading it; no second API call is needed.
    const logs = await database.getAllFromIndex('apiUsageLogs', 'by-entryId', ENTRY_ID)
    console.log('\n=== OPENAI API USAGE ===')
    console.table(logs.map(log => ({
      provider: log.provider,
      model: log.model,
      inputTokens: log.inputTokens,
      outputTokens: log.outputTokens,
      date: log.date,
    })))
    console.log('Raw usage:', JSON.stringify(logs[0]?.rawUsage ?? null, null, 2))
    console.log('Usage log count:', logs.length)

    expect(logs).toHaveLength(1)
    expect(logs[0].entryId).toBe(ENTRY_ID)
    expect(logs[0].provider).toBe('openai')
    expect(logs[0].model).toBe(MODEL)
    expect(logs[0].inputTokens).toBeGreaterThan(0)
    expect(logs[0].outputTokens).toBeGreaterThan(0)
    expect(logs[0].rawUsage.prompt_tokens).toBe(logs[0].inputTokens)
    expect(logs[0].rawUsage.completion_tokens).toBe(logs[0].outputTokens)

    expect(logs[0].rawUsage.total_tokens).toBe(logs[0].inputTokens + logs[0].outputTokens)
    for (const value of Object.values(logs[0].rawUsage)) {
      expect(typeof value).toBe('number')
    }

    const has = (type: string, crop: string) => events.some(
      e => e.eventType === type && e.matchedRosterName === crop,
    )
    const nursery = events.find(e => e.eventType === 'nursery_pickup')
    const cucumberFix = events.find(
      e => e.eventType === 'fix' && e.matchedRosterName === 'Cucumber',
    )

    const qualityChecks = [
      { check: 'Tomatoes harvested', passed: has('harvest', 'Tomatoes') },
      { check: 'Zucchini problem', passed: has('problem', 'Zucchini') },
      { check: 'Broccoli observation', passed: has('observation', 'Broccoli') },
      { check: 'Nursery pickup for Tomatoes', passed: has('nursery_pickup', 'Tomatoes') },
      { check: 'Nursery name extracted', passed: nursery?.nurseryName === "Swanson's Nursery" },
      { check: 'Sungold variety extracted', passed: nursery?.variety === 'Sungold' },
      { check: 'Routine watering ignored', passed: !events.some(e => /watered the garden/i.test(e.notes)) },
      { check: 'Cucumber fix extracted', passed: Boolean(cucumberFix) },
      { check: 'Fix references open problem P1', passed: cucumberFix?.linkedProblemRef === 'P1' },
      { check: 'P1 resolves to expected existing problem', passed: labelMap.P1 === EXISTING_PROBLEM_ID },
      {
        check: 'No invented nursery on non-pickup events',
        passed: events.every(
          e => e.eventType === 'nursery_pickup' || e.nurseryName == null,
        ),
      },
      {
        check: 'Varieties are grounded in journal text',
        passed: events.every(
          e => e.variety == null ||
            ['Roma', 'Sungold'].includes(e.variety),
        ),
      },
    ]

    // Informational only — quality checks are nondeterministic and outside the AC-11 assertions.
    console.log('\n=== EXTRACTION QUALITY CHECKS (informational) ===')
    console.table(qualityChecks.map(({ check, passed }) => ({
      check,
      result: passed ? 'PASS' : 'REVIEW',
    })))
  } finally {
    globalThis.fetch = realFetch
    database.close()
  }
})
