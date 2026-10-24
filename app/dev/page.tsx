'use client'

import { db as dbPromise, resetDatabase } from '@/lib/db'
import { BASE_PATH } from '../../base-path.mjs'

type CorruptMode =
  | { kind: 'delete-store'; store: string }
  | { kind: 'delete-index'; store: string; index: string }
  | { kind: 'delete-all-stores' }

async function corruptDB(mode: CorruptMode): Promise<void> {
  const conn = await dbPromise.catch(() => null)
  conn?.close()
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('garden-journal', 2)
    req.onupgradeneeded = (event) => {
      const rawDb = (event.target as IDBOpenDBRequest).result
      if (mode.kind === 'delete-store') {
        rawDb.deleteObjectStore(mode.store)
      } else if (mode.kind === 'delete-index') {
        const tx = (event.target as IDBOpenDBRequest).transaction!
        tx.objectStore(mode.store).deleteIndex(mode.index)
      } else {
        Array.from(rawDb.objectStoreNames).forEach((n) => rawDb.deleteObjectStore(n))
      }
    }
    req.onsuccess = () => { req.result.close(); resolve() }
    req.onerror = () => reject(req.error)
  })
}

export default function DevPage() {
  async function handleWipe() {
    if (!confirm('Wipe all local data? This cannot be undone.')) return
    await resetDatabase()
    window.location.href = `${BASE_PATH}/journal/`
  }

  async function handleCorrupt(label: string, mode: CorruptMode) {
    if (!confirm(`Corrupt DB: ${label}?\n\nPage will reload — you should see the schema guard.`)) return
    await corruptDB(mode)
    window.location.reload()
  }

  const corruptions: Array<{ label: string; mode: CorruptMode }> = [
    { label: 'Delete store: generalNotes (newest)', mode: { kind: 'delete-store', store: 'generalNotes' } },
    { label: 'Delete store: cropInstances', mode: { kind: 'delete-store', store: 'cropInstances' } },
    { label: 'Delete index: journalEntries / by-needsSync', mode: { kind: 'delete-index', store: 'journalEntries', index: 'by-needsSync' } },
    { label: 'Delete index: cropInstances / by-cropTypeId', mode: { kind: 'delete-index', store: 'cropInstances', index: 'by-cropTypeId' } },
    { label: 'Delete all stores', mode: { kind: 'delete-all-stores' } },
  ]

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <h1>Dev Tools</h1>

      <h2>DB Reset</h2>
      <button onClick={handleWipe}>Wipe local database</button>

      <h2 style={{ marginTop: '1.5rem' }}>Schema Guard Testing</h2>
      <p style={{ fontSize: '0.875rem', color: '#666' }}>
        Corrupts the DB, then reloads. Blocking screen should appear — use &quot;Wipe local data&quot; to recover.
      </p>
      {corruptions.map(({ label, mode }) => (
        <button key={label} onClick={() => handleCorrupt(label, mode)}>{label}</button>
      ))}
    </div>
  )
}
