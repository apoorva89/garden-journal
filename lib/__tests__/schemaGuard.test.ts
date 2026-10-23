import { describe, it, expect } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { openDB } from 'idb'
import { openGardenDB, isSchemaValid, SCHEMA } from '../db'
import type { GardenDB } from '../db'

describe('isSchemaValid', () => {
  it('returns true for a fresh DB created from SCHEMA', async () => {
    const db = await openGardenDB(new IDBFactory())
    expect(isSchemaValid(db)).toBe(true)
  })

  it('returns false when a store is missing', async () => {
    // Create a DB that is missing all but one store
    const idb = new IDBFactory()
    ;(globalThis as Record<string, unknown>).indexedDB = idb
    const db = await openDB<any>('test-missing-store', 1, {
      upgrade(database) {
        database.createObjectStore('cropTypes', { keyPath: 'id' })
        // All other SCHEMA stores intentionally absent
      },
    })
    expect(isSchemaValid(db as unknown as GardenDB)).toBe(false)
  })

  it('returns false when an index is missing', async () => {
    // Create all stores from SCHEMA but omit all indexes on cropInstances
    const idb = new IDBFactory()
    ;(globalThis as Record<string, unknown>).indexedDB = idb
    const db = await openDB<any>('test-missing-index', 1, {
      upgrade(database) {
        for (const [storeName, spec] of Object.entries(SCHEMA)) {
          const store = database.createObjectStore(storeName, spec.options)
          if (storeName === 'cropInstances') continue // skip its indexes
          for (const [indexName, { keyPath, options }] of Object.entries(spec.indexes ?? {})) {
            store.createIndex(indexName, keyPath, options)
          }
        }
      },
    })
    expect(isSchemaValid(db as unknown as GardenDB)).toBe(false)
  })

  it('returns false when the check throws', () => {
    expect(isSchemaValid(null as unknown as GardenDB)).toBe(false)
  })
})
