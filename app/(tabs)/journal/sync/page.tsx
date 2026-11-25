import { Suspense } from 'react'
import SyncReview from './SyncReview'

export default function SyncReviewPage() {
  return (
    <Suspense>
      <SyncReview />
    </Suspense>
  )
}
