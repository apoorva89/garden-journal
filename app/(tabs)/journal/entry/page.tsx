import { Suspense } from 'react'
import EntryDetail from './EntryDetail'

export default function EntryDetailPage() {
  return (
    <Suspense>
      <EntryDetail />
    </Suspense>
  )
}
