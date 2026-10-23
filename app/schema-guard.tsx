'use client'

import { useState, useEffect } from 'react'
import { db as dbPromise, isSchemaValid } from '@/lib/db'

export default function SchemaGuard({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'checking' | 'valid' | 'invalid'>('checking')
  const [wipeBlocked, setWipeBlocked] = useState(false)

  useEffect(() => {
    dbPromise
      .then((database) => setStatus(isSchemaValid(database) ? 'valid' : 'invalid'))
      .catch(() => setStatus('invalid'))
  }, [])

  async function handleWipe() {
    setWipeBlocked(false)
    const conn = await dbPromise.catch(() => null)
    conn?.close()
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('garden-journal')
      req.onblocked = () => setWipeBlocked(true)
      req.onsuccess = () => resolve()
      req.onerror = () => resolve() // resolve anyway; reload will re-open fresh
    })
    window.location.reload()
  }

  if (status === 'checking') return null

  if (status === 'invalid') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center bg-cream z-50">
        <p className="text-lg font-semibold text-ink">Local data is out of date.</p>
        <p className="text-ink/70">Wipe it to continue. Unsynced entries will be lost.</p>
        {wipeBlocked && (
          <p className="text-sm text-terra">Close other tabs of this app and try again.</p>
        )}
        <button
          onClick={handleWipe}
          className="mt-2 px-6 py-3 bg-terra text-surface rounded-lg font-medium active:opacity-80"
        >
          Wipe local data
        </button>
      </div>
    )
  }

  return <>{children}</>
}
