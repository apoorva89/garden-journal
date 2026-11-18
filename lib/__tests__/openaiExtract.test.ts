import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { ZodError } from 'zod'
import { buildExtractionRequest } from '../ai/requestBuilder'
import { openGardenDB } from '../db'
import type { GardenDB, Settings } from '../db'
import { runExtraction } from '../orchestrator/ai'

const ENTRY_ID = 'openai-test-entry'
const SETTINGS: Settings = {
  locationName: 'Test Garden',
  lastFrostDate: null,
  latitude: null,
  longitude: null,
  aiProvider: 'openai',
  aiModel: 'configured-test-model',
  apiKeys: { openai: 'configured-test-key' },
}

const { request } = buildExtractionRequest({
  entryText: 'Tomatoes looking good.',
  entryDate: '2026-05-01',
  nextSeasonNote: '',
  roster: [{ id: 'ct-tomato', name: 'Tomatoes', lessons: [] }],
  openProblems: [],
})

const VALID_EVENTS = [{
  eventType: 'observation',
  matchedRosterName: 'Tomatoes',
  linkedProblemRef: null,
  notes: 'Tomatoes looking good.',
  eventDate: '2026-05-01',
  nurseryName: null,
  variety: null,
}]

const RAW_USAGE = {
  prompt_tokens: 100,
  completion_tokens: 50,
  total_tokens: 150,
  cache_read_input_tokens: 20,
}

const USAGE = {
  prompt_tokens: 100,
  completion_tokens: 50,
  total_tokens: 150,
  prompt_tokens_details: { cached_tokens: 20, audio_tokens: 0 },
  completion_tokens_details: { reasoning_tokens: 10 },
}

function toolResponse(args: string | undefined) {
  return {
    choices: [{
      message: { tool_calls: [{ type: 'function', function: { name: request.tool.name, arguments: args } }] },
    }],
  }
}

const VALID_TOOL_RESPONSE = toolResponse(JSON.stringify({ events: VALID_EVENTS }))

describe('runExtraction with OpenAI', () => {
  let database: GardenDB
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(async () => {
    database = await openGardenDB(new IDBFactory())
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    database.close()
    vi.unstubAllGlobals()
  })

  function respond(body: unknown) {
    fetchMock.mockResolvedValue(Response.json(body))
  }

  function run() {
    return runExtraction({ entryId: ENTRY_ID, request, settings: SETTINGS, database })
  }

  function getLogs() {
    return database.getAllFromIndex('apiUsageLogs', 'by-entryId', ENTRY_ID)
  }

  it('well-formed OpenAI response returns validated events', async () => {
    respond({ ...VALID_TOOL_RESPONSE, usage: USAGE })
    await expect(run()).resolves.toEqual(VALID_EVENTS)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('success logs one ApiUsageLog with mapped OpenAI usage, cache parity field, and numeric-only rawUsage values', async () => {
    respond({ ...VALID_TOOL_RESPONSE, usage: USAGE })
    await run()

    const logs = await getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ inputTokens: 100, outputTokens: 50 })
    expect(logs[0].rawUsage).toEqual(RAW_USAGE)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sends OpenAI wire format: URL, method, required-only headers, verbatim messages, renamed parameters, forced tool, model and key from Settings', async () => {
    respond({ ...VALID_TOOL_RESPONSE, usage: USAGE })
    await run()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect(init?.method).toBe('POST')
    expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
      authorization: 'Bearer configured-test-key',
      'content-type': 'application/json',
    })
    expect(JSON.parse(String(init?.body))).toEqual({
      model: SETTINGS.aiModel,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.userMessage },
      ],
      tools: [{
        type: 'function',
        function: {
          name: request.tool.name,
          description: request.tool.description,
          parameters: request.tool.input_schema,
        },
      }],
      tool_choice: { type: 'function', function: { name: request.tool.name } },
    })
  })

  it('schema-invalid events log usage then throw validation error', async () => {
    const events = [{ ...VALID_EVENTS[0], eventType: 'invalid' }]
    respond({ ...toolResponse(JSON.stringify({ events })), usage: USAGE })

    await expect(run()).rejects.toBeInstanceOf(ZodError)
    const logs = await getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].rawUsage).toEqual(RAW_USAGE)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['invalid JSON', toolResponse('{')],
    ['missing arguments', toolResponse(undefined)],
    ['missing tool calls', { choices: [{ message: {} }] }],
  ])('unparseable or missing tool arguments log usage then throw (%s)', async (_case, body) => {
    respond({ ...body, usage: USAGE })

    await expect(run()).rejects.toBeInstanceOf(ZodError)
    expect(await getLogs()).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('transport failure logs nothing and rejects', async () => {
    const error = new Error('network error')
    fetchMock.mockRejectedValue(error)
    await expect(run()).rejects.toBe(error)
    expect(await getLogs()).toEqual([])
  })

  it('non-2xx response logs nothing and rejects', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }))
    await expect(run()).rejects.toThrow('401')
    expect(await getLogs()).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('exactly one request on failure', async () => {
    const error = new Error('network error')
    fetchMock.mockRejectedValue(error)
    await expect(run()).rejects.toBe(error)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('no usage field returns events without writing a usage log', async () => {
    respond(VALID_TOOL_RESPONSE)
    await expect(run()).resolves.toEqual(VALID_EVENTS)
    expect(await getLogs()).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('logs zero token counts when the usage field is present but empty', async () => {
    respond({ ...VALID_TOOL_RESPONSE, usage: {} })
    await expect(run()).resolves.toEqual(VALID_EVENTS)

    const logs = await getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ inputTokens: 0, outputTokens: 0 })
    expect(logs[0].rawUsage).toEqual({})
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
