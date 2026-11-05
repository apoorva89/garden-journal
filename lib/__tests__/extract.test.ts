import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { openGardenDB } from '../db'
import type { GardenDB, Settings } from '../db'
import { runExtraction } from '../orchestrator/ai'
import type { ExtractionRequest } from '../ai/requestBuilder'

function freshDb() {
  return openGardenDB(new IDBFactory())
}

const MINIMAL_REQUEST: ExtractionRequest = {
  system: 'Extract garden events.',
  userMessage: 'Entry date: 2026-05-01\n\n<entry_text>\nTomatoes looking good.\n</entry_text>\n\n<crop_roster>\nTomatoes\n</crop_roster>',
  tool: {
    name: 'extract_garden_events',
    description: 'Extract structured garden events from a journal entry.',
    input_schema: {
      type: 'object',
      properties: { events: { type: 'array', items: {} } },
      required: ['events'],
    },
  },
}

const VALID_EVENTS = [
  {
    eventType: 'observation',
    matchedRosterName: 'Tomatoes',
    linkedProblemRef: null,
    notes: 'Tomatoes looking good.',
    eventDate: '2026-05-01',
    nurseryName: null,
    variety: null,
  },
]

const WELL_FORMED_RESPONSE = {
  id: 'msg_01abc',
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'tool_use',
      id: 'toolu_01abc',
      name: 'extract_garden_events',
      input: { events: VALID_EVENTS },
    },
  ],
  stop_reason: 'tool_use',
  usage: {
    input_tokens: 100,
    output_tokens: 50,
    cache_read_input_tokens: 20,
    cache_creation_input_tokens: 0,
  },
}

const ANTHROPIC_SETTINGS: Settings = {
  locationName: 'Test Garden',
  lastFrostDate: null,
  latitude: null,
  longitude: null,
  aiProvider: 'anthropic',
  aiModel: 'claude-sonnet-4-6',
  apiKeys: { anthropic: 'sk-ant-test123' },
}

function makeFetchOk(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  })
}

describe('runExtraction', () => {
  let db: GardenDB
  const ENTRY_ID = 'entry-test-01'

  beforeEach(async () => {
    db = await freshDb()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('well-formed response returns validated events', async () => {
    vi.stubGlobal('fetch', makeFetchOk(WELL_FORMED_RESPONSE))
    const events = await runExtraction({
      entryId: ENTRY_ID,
      request: MINIMAL_REQUEST,
      settings: ANTHROPIC_SETTINGS,
      database: db,
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ eventType: 'observation', matchedRosterName: 'Tomatoes' })
  })

  it('success logs one ApiUsageLog with rawUsage', async () => {
    vi.stubGlobal('fetch', makeFetchOk(WELL_FORMED_RESPONSE))
    await runExtraction({ entryId: ENTRY_ID, request: MINIMAL_REQUEST, settings: ANTHROPIC_SETTINGS, database: db })
    const logs = await db.getAllFromIndex('apiUsageLogs', 'by-entryId', ENTRY_ID)
    expect(logs).toHaveLength(1)
    expect(logs[0].inputTokens).toBe(100)
    expect(logs[0].outputTokens).toBe(50)
    expect(logs[0].rawUsage).toMatchObject({ cache_read_input_tokens: 20 })
  })

  it('malformed content logs usage then throws validation error', async () => {
    const malformedResponse = {
      ...WELL_FORMED_RESPONSE,
      content: [
        {
          type: 'tool_use',
          id: 'toolu_01abc',
          name: 'extract_garden_events',
          input: {
            events: [
              {
                eventType: 'not-a-valid-type',
                matchedRosterName: null,
                linkedProblemRef: null,
                notes: 'some note',
                eventDate: null,
                nurseryName: null,
                variety: null,
              },
            ],
          },
        },
      ],
    }
    vi.stubGlobal('fetch', makeFetchOk(malformedResponse))
    await expect(
      runExtraction({ entryId: ENTRY_ID, request: MINIMAL_REQUEST, settings: ANTHROPIC_SETTINGS, database: db })
    ).rejects.toThrow()
    const logs = await db.getAllFromIndex('apiUsageLogs', 'by-entryId', ENTRY_ID)
    expect(logs).toHaveLength(1)
    expect(logs[0].rawUsage).toMatchObject({ cache_read_input_tokens: 20 })
  })

  it('transport failure logs nothing and rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    await expect(
      runExtraction({ entryId: ENTRY_ID, request: MINIMAL_REQUEST, settings: ANTHROPIC_SETTINGS, database: db })
    ).rejects.toThrow('network error')
    const logs = await db.getAllFromIndex('apiUsageLogs', 'by-entryId', ENTRY_ID)
    expect(logs).toHaveLength(0)
  })

  it('exactly one request on failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network error'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      runExtraction({ entryId: ENTRY_ID, request: MINIMAL_REQUEST, settings: ANTHROPIC_SETTINGS, database: db })
    ).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('provider, model and key come from Settings', async () => {
    const fetchMock = makeFetchOk(WELL_FORMED_RESPONSE)
    vi.stubGlobal('fetch', fetchMock)
    const customSettings: Settings = {
      ...ANTHROPIC_SETTINGS,
      aiModel: 'claude-opus-4-8',
      apiKeys: { anthropic: 'sk-ant-custom-key' },
    }
    await runExtraction({ entryId: ENTRY_ID, request: MINIMAL_REQUEST, settings: customSettings, database: db })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    const headers = new Headers(init.headers as HeadersInit)
    expect(body.model).toBe('claude-opus-4-8')
    expect(headers.get('x-api-key')).toBe('sk-ant-custom-key')
  })

  it('request carries anthropic-dangerous-direct-browser-access header for CORS', async () => {
    const fetchMock = makeFetchOk(WELL_FORMED_RESPONSE)
    vi.stubGlobal('fetch', fetchMock)
    await runExtraction({ entryId: ENTRY_ID, request: MINIMAL_REQUEST, settings: ANTHROPIC_SETTINGS, database: db })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = new Headers(init.headers as HeadersInit)
    expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe('true')
  })

  it('200 response without content field logs usage then throws (D-067 on malformed 200)', async () => {
    // A billed 200 with no content field must still log usage before throwing.
    const noContentResponse = { usage: WELL_FORMED_RESPONSE.usage }
    vi.stubGlobal('fetch', makeFetchOk(noContentResponse))
    await expect(
      runExtraction({ entryId: ENTRY_ID, request: MINIMAL_REQUEST, settings: ANTHROPIC_SETTINGS, database: db })
    ).rejects.toThrow()
    const logs = await db.getAllFromIndex('apiUsageLogs', 'by-entryId', ENTRY_ID)
    expect(logs).toHaveLength(1)
  })
})
