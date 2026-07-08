import { describe, it, expect } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  openGardenDB,
  createJournalEntry,
  updateJournalEntry,
  createEntryPhoto,
  createCropType,
  createCropInstance,
  createCropEvent,
  getEntriesByMonth,
  getUnsyncedEntries,
  getLatestPhotoByCropType,
  getOpenProblemsByType,
} from '../db'

function freshDb() {
  return openGardenDB(new IDBFactory())
}

// ── getEntriesByMonth ─────────────────────────────────────────────────────────

describe('getEntriesByMonth', () => {
  it('returns only entries whose date falls in the requested month', async () => {
    const db = await freshDb()
    await createJournalEntry(
      { date: '2026-06-14', text: 'June', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-14T10:00:00Z' },
      db,
    )
    await createJournalEntry(
      { date: '2026-07-01', text: 'July', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-07-01T10:00:00Z' },
      db,
    )
    const entries = await getEntriesByMonth(2026, 6, db)
    expect(entries).toHaveLength(1)
    expect(entries[0].date).toBe('2026-06-14')
  })

  it('returns entries sorted newest-first', async () => {
    const db = await freshDb()
    await createJournalEntry(
      { date: '2026-06-01', text: 'first', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-01T10:00:00Z' },
      db,
    )
    await createJournalEntry(
      { date: '2026-06-20', text: 'third', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-20T10:00:00Z' },
      db,
    )
    await createJournalEntry(
      { date: '2026-06-10', text: 'second', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-10T10:00:00Z' },
      db,
    )
    const entries = await getEntriesByMonth(2026, 6, db)
    expect(entries).toHaveLength(3)
    expect(entries[0].date).toBe('2026-06-20')
    expect(entries[1].date).toBe('2026-06-10')
    expect(entries[2].date).toBe('2026-06-01')
  })

  it('returns empty array for a month with no entries', async () => {
    const db = await freshDb()
    await createJournalEntry(
      { date: '2026-06-14', text: 'June', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-14T10:00:00Z' },
      db,
    )
    const entries = await getEntriesByMonth(2026, 1, db)
    expect(entries).toHaveLength(0)
  })
})

// ── getUnsyncedEntries ────────────────────────────────────────────────────────

describe('getUnsyncedEntries', () => {
  it('returns entries where needsSync is 1', async () => {
    const db = await freshDb()
    await createJournalEntry(
      { date: '2026-06-01', text: 'unsynced', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-01T10:00:00Z' },
      db,
    )
    const results = await getUnsyncedEntries(db)
    expect(results).toHaveLength(1)
    expect(results[0].needsSync).toBe(1)
  })

  it('does not return entries where needsSync has been cleared', async () => {
    const db = await freshDb()
    const synced = await createJournalEntry(
      { date: '2026-06-01', text: 'synced', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-01T10:00:00Z' },
      db,
    )
    await createJournalEntry(
      { date: '2026-06-02', text: 'unsynced', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-02T10:00:00Z' },
      db,
    )
    // Clear the flag to mark as synced
    await updateJournalEntry({ ...synced, needsSync: undefined }, db)
    const results = await getUnsyncedEntries(db)
    expect(results).toHaveLength(1)
    expect(results[0].text).toBe('unsynced')
  })
})

// ── getLatestPhotoByCropType ──────────────────────────────────────────────────

describe('getLatestPhotoByCropType', () => {
  it('returns the photo with the latest createdAt tagged with the cropTypeId', async () => {
    const db = await freshDb()
    const cropTypeId = 'ct-tomato'

    await createEntryPhoto(
      { entryId: 'e1', data: new Blob(['older']), cropTypeIds: [cropTypeId], createdAt: '2026-05-01T10:00:00Z' },
      db,
    )
    await createEntryPhoto(
      { entryId: 'e2', data: new Blob(['newer']), cropTypeIds: [cropTypeId], createdAt: '2026-06-15T10:00:00Z' },
      db,
    )

    const photo = await getLatestPhotoByCropType(cropTypeId, db)
    expect(photo).not.toBeNull()
    expect(photo!.createdAt).toBe('2026-06-15T10:00:00Z')
  })

  it('returns null when no photos are tagged with that cropTypeId', async () => {
    const db = await freshDb()
    await createEntryPhoto(
      { entryId: 'e1', data: new Blob(['other']), cropTypeIds: ['ct-pepper'], createdAt: '2026-06-01T10:00:00Z' },
      db,
    )
    const photo = await getLatestPhotoByCropType('ct-nonexistent', db)
    expect(photo).toBeNull()
  })

  it('ignores photos tagged with a different cropTypeId', async () => {
    const db = await freshDb()
    await createEntryPhoto(
      { entryId: 'e1', data: new Blob(['other']), cropTypeIds: ['ct-pepper'], createdAt: '2026-06-01T10:00:00Z' },
      db,
    )
    const photo = await getLatestPhotoByCropType('ct-tomato', db)
    expect(photo).toBeNull()
  })
})

// ── getOpenProblemsByType ─────────────────────────────────────────────────────

describe('getOpenProblemsByType', () => {
  it('returns problem events for crop instances of the given cropTypeId', async () => {
    const db = await freshDb()
    const cropType = await createCropType({ name: 'Tomatoes', lessons: [] }, db)
    const instance = await createCropInstance(
      { cropTypeId: cropType.id, variety: 'Sungold', year: 2026, source: { type: 'seed' }, createdAt: '2026-04-01T00:00:00Z' },
      db,
    )
    await createCropEvent(
      { cropInstanceId: instance.id, date: '2026-06-01', type: 'problem', notes: 'Aphids!', linkedProblemId: null, photos: [], weatherC: null, weatherIcon: null },
      db,
    )
    const problems = await getOpenProblemsByType(cropType.id, db)
    expect(problems).toHaveLength(1)
    expect(problems[0].type).toBe('problem')
    expect(problems[0].notes).toBe('Aphids!')
  })

  it('does not return non-problem events', async () => {
    const db = await freshDb()
    const cropType = await createCropType({ name: 'Tomatoes', lessons: [] }, db)
    const instance = await createCropInstance(
      { cropTypeId: cropType.id, variety: 'Sungold', year: 2026, source: { type: 'seed' }, createdAt: '2026-04-01T00:00:00Z' },
      db,
    )
    await createCropEvent(
      { cropInstanceId: instance.id, date: '2026-06-01', type: 'observation', notes: 'Looking healthy', linkedProblemId: null, photos: [], weatherC: null, weatherIcon: null },
      db,
    )
    await createCropEvent(
      { cropInstanceId: instance.id, date: '2026-06-02', type: 'harvest', notes: 'First tomatoes', linkedProblemId: null, photos: [], weatherC: null, weatherIcon: null },
      db,
    )
    const problems = await getOpenProblemsByType(cropType.id, db)
    expect(problems).toHaveLength(0)
  })

  it('does not return problems that have a linked fix event', async () => {
    const db = await freshDb()
    const cropType = await createCropType({ name: 'Tomatoes', lessons: [] }, db)
    const instance = await createCropInstance(
      { cropTypeId: cropType.id, variety: 'Sungold', year: 2026, source: { type: 'seed' }, createdAt: '2026-04-01T00:00:00Z' },
      db,
    )
    const problem = await createCropEvent(
      { cropInstanceId: instance.id, date: '2026-06-01', type: 'problem', notes: 'Aphids!', linkedProblemId: null, photos: [], weatherC: null, weatherIcon: null },
      db,
    )
    // Open problem — no fix yet
    const openProblem = await createCropEvent(
      { cropInstanceId: instance.id, date: '2026-06-02', type: 'problem', notes: 'Blight', linkedProblemId: null, photos: [], weatherC: null, weatherIcon: null },
      db,
    )
    // Fix linked to the first problem
    await createCropEvent(
      { cropInstanceId: instance.id, date: '2026-06-05', type: 'fix', notes: 'Sprayed neem', linkedProblemId: problem.id, photos: [], weatherC: null, weatherIcon: null },
      db,
    )
    const problems = await getOpenProblemsByType(cropType.id, db)
    expect(problems).toHaveLength(1)
    expect(problems[0].id).toBe(openProblem.id)
  })
})
