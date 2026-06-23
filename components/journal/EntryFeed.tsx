import type { JournalEntry, EntryPhoto } from '@/lib/db'
import EntryCard from './EntryCard'

interface Props {
  entries: JournalEntry[]
  photosByEntry: Record<string, EntryPhoto[]>
}

export default function EntryFeed({ entries, photosByEntry }: Props) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-mushroom">
        <span className="text-5xl mb-4" aria-hidden>🌱</span>
        <p className="text-sm font-medium">No entries yet</p>
        <p className="text-xs mt-1 text-muted">Tap + to add your first entry</p>
      </div>
    )
  }

  return (
    <div className="pt-4">
      {entries.map((entry) => (
        <EntryCard
          key={entry.id}
          entry={entry}
          photos={photosByEntry[entry.id] ?? []}
        />
      ))}
    </div>
  )
}
