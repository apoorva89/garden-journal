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
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '320px' }}>
      <h1>Dev Tools</h1>
      <button
        onClick={handleWipe}
        style={{ padding: '0.75rem 1rem', border: '1px solid #999', borderRadius: '6px', background: '#eee', cursor: 'pointer', fontSize: '1rem' }}
      >
        Wipe local database
      </button>
    </div>
  )
}
