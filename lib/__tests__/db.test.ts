import { describe, it, expect } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  openGardenDB,
  createJournalEntry,
  updateJournalEntry,
  updateJournalEntryAndPhotoDates,
  createEntryPhoto,
  getEntryPhotosByEntry,
  createCropType,
  createCropInstance,
  createCropEvent,
  updateCropEvent,
  getEntriesByMonth,
  getUnsyncedEntries,
  getLatestPhotoByCropType,
  getLatestPhotoByCropTypeAndYear,
  getOpenProblemsByType,
  getAllOpenProblems,
  addLessonToCropType,
  getSettings,
  saveSettings,
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

// ── getAllOpenProblems ────────────────────────────────────────────────────────

describe('getAllOpenProblems', () => {
  it('returns unresolved problems matching the target year', async () => {
    const db = await freshDb()
    const cropType = await createCropType({ name: 'Tomatoes', lessons: [] }, db)
    const instance = await createCropInstance(
      { cropTypeId: cropType.id, variety: 'Sungold', year: 2026, source: { type: 'seed' }, createdAt: '2026-04-01T00:00:00Z' },
      db,
    )
    await createCropEvent(
      { cropInstanceId: instance.id, date: '2026-06-01', type: 'problem', notes: 'Aphids', linkedProblemId: null, photos: [], weatherC: null, weatherIcon: null },
      db,
    )
    const problems = await getAllOpenProblems(2026, db)
    expect(problems).toHaveLength(1)
    expect(problems[0].type).toBe('problem')
    expect(problems[0].resolved).toBe(false)
    expect(problems[0].year).toBe(2026)
  })

  it('excludes problems that have been explicitly resolved', async () => {
    const db = await freshDb()
    const cropType = await createCropType({ name: 'Tomatoes', lessons: [] }, db)
    const instance = await createCropInstance(
      { cropTypeId: cropType.id, variety: 'Sungold', year: 2026, source: { type: 'seed' }, createdAt: '2026-04-01T00:00:00Z' },
      db,
    )
    const problem = await createCropEvent(
      { cropInstanceId: instance.id, date: '2026-06-01', type: 'problem', notes: 'Aphids', linkedProblemId: null, photos: [], weatherC: null, weatherIcon: null },
      db,
    )
    await updateCropEvent({ ...problem, resolved: true }, db)
    const problems = await getAllOpenProblems(2026, db)
    expect(problems).toHaveLength(0)
  })

  it('excludes problems from other years', async () => {
    const db = await freshDb()
    const cropType = await createCropType({ name: 'Tomatoes', lessons: [] }, db)
    const inst25 = await createCropInstance(
      { cropTypeId: cropType.id, variety: 'Sungold', year: 2025, source: { type: 'seed' }, createdAt: '2025-04-01T00:00:00Z' },
      db,
    )
    const inst26 = await createCropInstance(
      { cropTypeId: cropType.id, variety: 'Sungold', year: 2026, source: { type: 'seed' }, createdAt: '2026-04-01T00:00:00Z' },
      db,
    )
    await createCropEvent(
      { cropInstanceId: inst25.id, date: '2025-06-01', type: 'problem', notes: 'Old blight', linkedProblemId: null, photos: [], weatherC: null, weatherIcon: null },
      db,
    )
    await createCropEvent(
      { cropInstanceId: inst26.id, date: '2026-06-01', type: 'problem', notes: 'Current aphids', linkedProblemId: null, photos: [], weatherC: null, weatherIcon: null },
      db,
    )
    const problems = await getAllOpenProblems(2026, db)
    expect(problems).toHaveLength(1)
    expect(problems[0].notes).toBe('Current aphids')
  })
})

// ── addLessonToCropType ───────────────────────────────────────────────────────

describe('addLessonToCropType', () => {
  it('appends a lesson to the crop type', async () => {
    const db = await freshDb()
    const cropType = await createCropType({ name: 'Tomatoes', lessons: [] }, db)
    await addLessonToCropType(cropType.id, 'Water deeply, not often', db)
    const updated = await db.get('cropTypes', cropType.id)
    expect(updated!.lessons).toHaveLength(1)
    expect(updated!.lessons[0].text).toBe('Water deeply, not often')
    expect(updated!.lessons[0].id).toBeTruthy()
    expect(updated!.lessons[0].createdAt).toBeTruthy()
  })

  it('appends multiple lessons in order', async () => {
    const db = await freshDb()
    const cropType = await createCropType({ name: 'Peppers', lessons: [] }, db)
    await addLessonToCropType(cropType.id, 'First lesson', db)
    await addLessonToCropType(cropType.id, 'Second lesson', db)
    const updated = await db.get('cropTypes', cropType.id)
    expect(updated!.lessons).toHaveLength(2)
    expect(updated!.lessons[0].text).toBe('First lesson')
    expect(updated!.lessons[1].text).toBe('Second lesson')
  })

  it('throws when cropTypeId does not exist', async () => {
    const db = await freshDb()
    await expect(addLessonToCropType('nonexistent', 'text', db)).rejects.toThrow('CropType not found')
  })
})

// ── getLatestPhotoByCropTypeAndYear ───────────────────────────────────────────

describe('getLatestPhotoByCropTypeAndYear', () => {
  it('returns the latest photo tagged with the cropTypeId in the given year', async () => {
    const db = await freshDb()
    const cropTypeId = 'ct-tomato'
    await createEntryPhoto(
      { entryId: 'e1', data: new Blob(['older']), cropTypeIds: [cropTypeId], createdAt: '2025-06-01T10:00:00Z', entryDate: '2025-06-01' },
      db,
    )
    await createEntryPhoto(
      { entryId: 'e2', data: new Blob(['newer-2026']), cropTypeIds: [cropTypeId], createdAt: '2026-05-01T10:00:00Z', entryDate: '2026-05-01' },
      db,
    )
    await createEntryPhoto(
      { entryId: 'e3', data: new Blob(['latest-2026']), cropTypeIds: [cropTypeId], createdAt: '2026-06-15T10:00:00Z', entryDate: '2026-06-15' },
      db,
    )
    const photo = await getLatestPhotoByCropTypeAndYear(cropTypeId, 2026, db)
    expect(photo).not.toBeNull()
    expect(photo!.createdAt).toBe('2026-06-15T10:00:00Z')
  })

  it('returns null when no photos in the given year', async () => {
    const db = await freshDb()
    const cropTypeId = 'ct-tomato'
    await createEntryPhoto(
      { entryId: 'e1', data: new Blob(['old']), cropTypeIds: [cropTypeId], createdAt: '2025-06-01T10:00:00Z', entryDate: '2025-06-01' },
      db,
    )
    const photo = await getLatestPhotoByCropTypeAndYear(cropTypeId, 2026, db)
    expect(photo).toBeNull()
  })

  it('ignores photos without entryDate', async () => {
    const db = await freshDb()
    const cropTypeId = 'ct-tomato'
    await createEntryPhoto(
      { entryId: 'e1', data: new Blob(['no-date']), cropTypeIds: [cropTypeId], createdAt: '2026-06-01T10:00:00Z' },
      db,
    )
    const photo = await getLatestPhotoByCropTypeAndYear(cropTypeId, 2026, db)
    expect(photo).toBeNull()
  })
})

// ── updateJournalEntryAndPhotoDates ───────────────────────────────────────────

describe('updateJournalEntryAndPhotoDates', () => {
  it('cascades new date to all photos in the same transaction', async () => {
    const db = await freshDb()
    const entry = await createJournalEntry(
      { date: '2026-06-01', text: 'Test', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-01T10:00:00Z' },
      db,
    )
    const p1 = await createEntryPhoto(
      { entryId: entry.id, data: new Blob(['a']), cropTypeIds: [], createdAt: '2026-06-01T10:00:00Z', entryDate: '2026-06-01' },
      db,
    )
    const p2 = await createEntryPhoto(
      { entryId: entry.id, data: new Blob(['b']), cropTypeIds: [], createdAt: '2026-06-01T10:01:00Z', entryDate: '2026-06-01' },
      db,
    )
    const updatedEntry = { ...entry, date: '2026-07-15', yearMonth: '2026-07', photoIds: [p1.id, p2.id] }
    await updateJournalEntryAndPhotoDates(updatedEntry, db)

    const photos = await getEntryPhotosByEntry(entry.id, db)
    expect(photos.every((p) => p.entryDate === '2026-07-15')).toBe(true)

    const saved = await db.get('journalEntries', entry.id)
    expect(saved!.date).toBe('2026-07-15')
  })

  it('handles an entry with no photos', async () => {
    const db = await freshDb()
    const entry = await createJournalEntry(
      { date: '2026-06-01', text: 'No photos', nextSeasonNote: '', weatherC: null, weatherIcon: null, photoIds: [], createdAt: '2026-06-01T10:00:00Z' },
      db,
    )
    await expect(updateJournalEntryAndPhotoDates({ ...entry, date: '2026-07-01', yearMonth: '2026-07' }, db)).resolves.toBeUndefined()
  })
})

// ── getSettings / saveSettings ────────────────────────────────────────────────

describe('getSettings / saveSettings', () => {
  it('returns null on a fresh database', async () => {
    const db = await freshDb()
    expect(await getSettings(db)).toBeNull()
  })

  it('round-trips all fields', async () => {
    const db = await freshDb()
    const s = {
      locationName: 'Seattle, WA',
      lastFrostDate: '2026-04-15',
      latitude: 47.6062,
      longitude: -122.3321,
      aiProvider: 'anthropic',
      aiModel: 'claude-sonnet-4-6',
      apiKeys: { anthropic: 'sk-ant-test', openai: 'sk-test' },
    }
    await saveSettings(s, db)
    expect(await getSettings(db)).toEqual(s)
  })

  it('overwrites on a second save', async () => {
    const db = await freshDb()
    await saveSettings(
      { locationName: 'Portland, OR', lastFrostDate: null, latitude: 45.52, longitude: -122.68, aiProvider: '', aiModel: '', apiKeys: {} },
      db,
    )
    await saveSettings(
      { locationName: 'Tucson, AZ', lastFrostDate: '2026-03-01', latitude: 32.22, longitude: -110.97, aiProvider: 'openai', aiModel: 'gpt-4o', apiKeys: { openai: 'sk-new' } },
      db,
    )
    const result = await getSettings(db)
    expect(result?.locationName).toBe('Tucson, AZ')
    expect(result?.aiProvider).toBe('openai')
  })
})
