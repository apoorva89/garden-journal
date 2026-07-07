import { openDB } from 'idb'
import type { IDBPDatabase, DBSchema } from 'idb'
import { nanoid } from 'nanoid'

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface Lesson {
  id: string
  text: string
  createdAt: string
}

export interface CropType {
  id: string
  name: string
  lessons: Lesson[]
}

export interface CropInstance {
  id: string
  cropTypeId: string
  variety: string
  year: number
  source: { type: 'nursery'; name: string } | { type: 'seed' }
  createdAt: string
}

export interface EntryPhoto {
  id: string
  entryId: string
  dataUrl: string
  cropTypeIds: string[]
  createdAt: string
}

export interface JournalEntry {
  id: string
  date: string
  yearMonth: string
  text: string
  nextSeasonNote: string
  weatherC: number | null
  weatherIcon: string | null
  photoIds: string[]
  /** Present (value 1) = awaiting sync; absent = synced. Sparse index lets IDB skip synced entries entirely. */
  needsSync?: 1
  createdAt: string
}

export interface CropEvent {
  id: string
  cropInstanceId: string
  date: string
  type: 'observation' | 'problem' | 'fix' | 'nursery_pickup' | 'harvest' | 'lesson'
  notes: string
  linkedProblemId: string | null
  photos: string[]
  weatherC: number | null
  weatherIcon: string | null
}

export interface CareTask {
  id: string
  cropInstanceId: string
  name: string
  schedule: string
  product: string
  dosage: string
}

export interface Settings {
  locationName: string
  lastFrostDate: string | null
}

// ── DB Schema (internal) ──────────────────────────────────────────────────────

interface GardenDBSchema extends DBSchema {
  cropTypes: {
    key: string
    value: CropType
  }
  cropInstances: {
    key: string
    value: CropInstance
    indexes: { 'by-cropTypeId': string }
  }
  journalEntries: {
    key: string
    value: JournalEntry
    indexes: { 'by-yearMonth': string; 'by-needsSync': number }
  }
  entryPhotos: {
    key: string
    value: EntryPhoto
    indexes: { 'by-entryId': string; 'by-cropTypeId': string }
  }
  cropEvents: {
    key: string
    value: CropEvent
    indexes: { 'by-cropInstanceId': string; 'by-type': string }
  }
  careTasks: {
    key: string
    value: CareTask
    indexes: { 'by-cropInstanceId': string }
  }
  settings: {
    key: string
    value: Settings
  }
}

type GardenDB = IDBPDatabase<GardenDBSchema>

// ── Open / Singleton ──────────────────────────────────────────────────────────

export async function openGardenDB(idbFactory?: IDBFactory): Promise<GardenDB> {
  if (idbFactory) {
    // Allow tests to inject a fresh fake-indexeddb IDBFactory.
    // idb's openDB reads the global indexedDB, so we swap it here.
    ;(globalThis as Record<string, unknown>)['indexedDB'] = idbFactory
  }

  return openDB<GardenDBSchema>('garden-journal', 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore('cropTypes', { keyPath: 'id' })

        const instances = database.createObjectStore('cropInstances', { keyPath: 'id' })
        instances.createIndex('by-cropTypeId', 'cropTypeId')

        const entries = database.createObjectStore('journalEntries', { keyPath: 'id' })
        entries.createIndex('by-yearMonth', 'yearMonth')
        entries.createIndex('by-needsSync', 'needsSync')

        const events = database.createObjectStore('cropEvents', { keyPath: 'id' })
        events.createIndex('by-cropInstanceId', 'cropInstanceId')
        events.createIndex('by-type', 'type')

        const tasks = database.createObjectStore('careTasks', { keyPath: 'id' })
        tasks.createIndex('by-cropInstanceId', 'cropInstanceId')

        database.createObjectStore('settings')
      }

      if (oldVersion < 2) {
        const photos = database.createObjectStore('entryPhotos', { keyPath: 'id' })
        photos.createIndex('by-entryId', 'entryId')
        photos.createIndex('by-cropTypeId', 'cropTypeIds', { multiEntry: true })
      }
    },
  })
}

export const db: Promise<GardenDB> =
  typeof indexedDB !== 'undefined'
    ? openGardenDB()
    : Promise.reject(new Error('IndexedDB is not available in this environment'))

db.catch(() => {})

async function useDb(database?: GardenDB): Promise<GardenDB> {
  return database ?? db
}

// ── CropType CRUD ─────────────────────────────────────────────────────────────

export async function getAllCropTypes(database?: GardenDB): Promise<CropType[]> {
  return (await useDb(database)).getAll('cropTypes')
}

export async function getCropTypeById(id: string, database?: GardenDB): Promise<CropType | undefined> {
  return (await useDb(database)).get('cropTypes', id)
}

export async function createCropType(data: Omit<CropType, 'id'>, database?: GardenDB): Promise<CropType> {
  const d = await useDb(database)
  const record: CropType = { ...data, id: nanoid() }
  await d.add('cropTypes', record)
  return record
}

export async function updateCropType(cropType: CropType, database?: GardenDB): Promise<void> {
  await (await useDb(database)).put('cropTypes', cropType)
}

export async function deleteCropType(id: string, database?: GardenDB): Promise<void> {
  await (await useDb(database)).delete('cropTypes', id)
}

// ── CropInstance CRUD ─────────────────────────────────────────────────────────

export async function getAllCropInstances(database?: GardenDB): Promise<CropInstance[]> {
  return (await useDb(database)).getAll('cropInstances')
}

export async function getCropInstanceById(id: string, database?: GardenDB): Promise<CropInstance | undefined> {
  return (await useDb(database)).get('cropInstances', id)
}

export async function createCropInstance(data: Omit<CropInstance, 'id'>, database?: GardenDB): Promise<CropInstance> {
  const d = await useDb(database)
  const record: CropInstance = { ...data, id: nanoid() }
  await d.add('cropInstances', record)
  return record
}

export async function updateCropInstance(cropInstance: CropInstance, database?: GardenDB): Promise<void> {
  await (await useDb(database)).put('cropInstances', cropInstance)
}

export async function deleteCropInstance(id: string, database?: GardenDB): Promise<void> {
  await (await useDb(database)).delete('cropInstances', id)
}

// ── JournalEntry CRUD ─────────────────────────────────────────────────────────

export async function getAllJournalEntries(database?: GardenDB): Promise<JournalEntry[]> {
  return (await useDb(database)).getAll('journalEntries')
}

export async function getJournalEntryById(id: string, database?: GardenDB): Promise<JournalEntry | undefined> {
  return (await useDb(database)).get('journalEntries', id)
}

export async function createJournalEntry(
  data: Omit<JournalEntry, 'id' | 'yearMonth' | 'needsSync'>,
  database?: GardenDB,
): Promise<JournalEntry> {
  const d = await useDb(database)
  const record: JournalEntry = { ...data, id: nanoid(), yearMonth: data.date.slice(0, 7), needsSync: 1 }
  await d.add('journalEntries', record)
  return record
}

export async function updateJournalEntry(entry: JournalEntry, database?: GardenDB): Promise<void> {
  await (await useDb(database)).put('journalEntries', entry)
}

export async function deleteJournalEntry(id: string, database?: GardenDB): Promise<void> {
  await (await useDb(database)).delete('journalEntries', id)
}

// ── EntryPhoto CRUD ───────────────────────────────────────────────────────────

export async function createEntryPhoto(data: Omit<EntryPhoto, 'id'>, database?: GardenDB): Promise<EntryPhoto> {
  const d = await useDb(database)
  const record: EntryPhoto = { ...data, id: nanoid() }
  await d.add('entryPhotos', record)
  return record
}

export async function getEntryPhotosByEntry(entryId: string, database?: GardenDB): Promise<EntryPhoto[]> {
  return (await useDb(database)).getAllFromIndex('entryPhotos', 'by-entryId', entryId)
}

export async function updateEntryPhoto(photo: EntryPhoto, database?: GardenDB): Promise<void> {
  await (await useDb(database)).put('entryPhotos', photo)
}

export async function deleteEntryPhoto(id: string, database?: GardenDB): Promise<void> {
  await (await useDb(database)).delete('entryPhotos', id)
}

// ── CropEvent CRUD ────────────────────────────────────────────────────────────

export async function getAllCropEvents(database?: GardenDB): Promise<CropEvent[]> {
  return (await useDb(database)).getAll('cropEvents')
}

export async function getCropEventById(id: string, database?: GardenDB): Promise<CropEvent | undefined> {
  return (await useDb(database)).get('cropEvents', id)
}

export async function createCropEvent(data: Omit<CropEvent, 'id'>, database?: GardenDB): Promise<CropEvent> {
  const d = await useDb(database)
  const record: CropEvent = { ...data, id: nanoid() }
  await d.add('cropEvents', record)
  return record
}

export async function updateCropEvent(event: CropEvent, database?: GardenDB): Promise<void> {
  await (await useDb(database)).put('cropEvents', event)
}

export async function deleteCropEvent(id: string, database?: GardenDB): Promise<void> {
  await (await useDb(database)).delete('cropEvents', id)
}

// ── CareTask CRUD ─────────────────────────────────────────────────────────────

export async function getAllCareTasks(database?: GardenDB): Promise<CareTask[]> {
  return (await useDb(database)).getAll('careTasks')
}

export async function getCareTaskById(id: string, database?: GardenDB): Promise<CareTask | undefined> {
  return (await useDb(database)).get('careTasks', id)
}

export async function createCareTask(data: Omit<CareTask, 'id'>, database?: GardenDB): Promise<CareTask> {
  const d = await useDb(database)
  const record: CareTask = { ...data, id: nanoid() }
  await d.add('careTasks', record)
  return record
}

export async function updateCareTask(task: CareTask, database?: GardenDB): Promise<void> {
  await (await useDb(database)).put('careTasks', task)
}

export async function deleteCareTask(id: string, database?: GardenDB): Promise<void> {
  await (await useDb(database)).delete('careTasks', id)
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getSettings(database?: GardenDB): Promise<Settings | null> {
  const result = await (await useDb(database)).get('settings', 'settings')
  return result ?? null
}

export async function saveSettings(settings: Settings, database?: GardenDB): Promise<void> {
  await (await useDb(database)).put('settings', settings, 'settings')
}

// ── Query Functions ───────────────────────────────────────────────────────────

export async function getEntriesByMonth(
  year: number,
  month: number,
  database?: GardenDB,
): Promise<JournalEntry[]> {
  const d = await useDb(database)
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`
  const entries = await d.getAllFromIndex('journalEntries', 'by-yearMonth', yearMonth)
  return entries.sort((a, b) => b.date.localeCompare(a.date) || a.createdAt.localeCompare(b.createdAt))
}

export async function getUnsyncedEntries(database?: GardenDB): Promise<JournalEntry[]> {
  return (await useDb(database)).getAllFromIndex('journalEntries', 'by-needsSync', 1)
}

export async function getCropInstancesByType(
  cropTypeId: string,
  database?: GardenDB,
): Promise<CropInstance[]> {
  return (await useDb(database)).getAllFromIndex('cropInstances', 'by-cropTypeId', cropTypeId)
}

export async function getEventsByInstance(
  cropInstanceId: string,
  database?: GardenDB,
): Promise<CropEvent[]> {
  return (await useDb(database)).getAllFromIndex('cropEvents', 'by-cropInstanceId', cropInstanceId)
}

export async function getCareTasksByInstance(
  cropInstanceId: string,
  database?: GardenDB,
): Promise<CareTask[]> {
  return (await useDb(database)).getAllFromIndex('careTasks', 'by-cropInstanceId', cropInstanceId)
}

export async function getOpenProblemsByType(
  cropTypeId: string,
  database?: GardenDB,
): Promise<CropEvent[]> {
  const d = await useDb(database)

  const instances = await d.getAllFromIndex('cropInstances', 'by-cropTypeId', cropTypeId)
  const instanceIds = new Set(instances.map((i) => i.id))

  const allProblems = await d.getAllFromIndex('cropEvents', 'by-type', 'problem')
  const relevantProblems = allProblems.filter((e) => instanceIds.has(e.cropInstanceId))

  const allFixes = await d.getAllFromIndex('cropEvents', 'by-type', 'fix')
  const fixedProblemIds = new Set(
    allFixes.flatMap((f) => (f.linkedProblemId ? [f.linkedProblemId] : [])),
  )

  return relevantProblems.filter((p) => !fixedProblemIds.has(p.id))
}

export async function getLatestPhotoByCropType(
  cropTypeId: string,
  database?: GardenDB,
): Promise<EntryPhoto | null> {
  const photos = await (await useDb(database)).getAllFromIndex('entryPhotos', 'by-cropTypeId', cropTypeId)
  return photos.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
}
