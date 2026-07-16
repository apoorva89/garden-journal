'use client'

import { resetDatabase } from '@/lib/db'
import { BASE_PATH } from '../../base-path.mjs'

export default function DevPage() {
  async function handleWipe() {
    if (!confirm('Wipe all local data? This cannot be undone.')) return
    await resetDatabase()
    window.location.href = `${BASE_PATH}/journal/`
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Dev Tools</h1>
      <button onClick={handleWipe}>Wipe local database</button>
    </div>
  )
}
