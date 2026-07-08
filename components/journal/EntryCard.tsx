import Link from 'next/link'
import type { JournalEntry, EntryPhoto } from '@/lib/db'

interface PhotoStripProps {
  photos: EntryPhoto[]
}

function PhotoStrip({ photos }: PhotoStripProps) {
  if (photos.length === 0) return null

  if (photos.length === 1) {
    return (
      <div className="mt-3 rounded-xl overflow-hidden" style={{ height: 200 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photos[0].dataUrl} alt="" className="w-full h-full object-cover" />
      </div>
    )
  }

  if (photos.length === 2) {
    return (
      <div className="mt-3 flex gap-1 rounded-xl overflow-hidden" style={{ height: 160 }}>
        {photos.map((p) => (
          <div key={p.id} className="flex-1 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.dataUrl} alt="" className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="mt-3 flex gap-1 rounded-xl overflow-hidden" style={{ height: 200 }}>
      <div className="flex-1 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photos[0].dataUrl} alt="" className="w-full h-full object-cover" />
      </div>
      <div className="flex flex-col gap-1 overflow-hidden" style={{ width: '38%' }}>
        {photos.slice(1, 3).map((p) => (
          <div key={p.id} className="flex-1 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.dataUrl} alt="" className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
    </div>
  )
}

interface Props {
  entry: JournalEntry
  photos: EntryPhoto[]
}

export default function EntryCard({ entry, photos }: Props) {
  const d = new Date(entry.date + 'T00:00:00')
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' })
  const day = d.getDate()
  const monthName = d.toLocaleDateString('en-GB', { month: 'long' })

  return (
    <Link
      href={`/journal/entry?id=${entry.id}`}
      onClick={(e) => {
        if (!navigator.onLine) {
          e.preventDefault();
          window.location.assign((e.currentTarget as HTMLAnchorElement).href);
        }
      }}
      className="block mx-4 mb-4 bg-surface rounded-2xl p-4 active:opacity-80"
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-[11px] font-bold tracking-widest uppercase text-forest leading-tight">
          {weekday}, {day} {monthName}
        </h2>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {entry.needsSync === 1 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold whitespace-nowrap">
              Awaiting sync
            </span>
          )}
          {entry.weatherIcon != null && entry.weatherC != null && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-weather text-muted whitespace-nowrap">
              {entry.weatherIcon} {entry.weatherC}°C
            </span>
          )}
        </div>
      </div>

      {entry.text ? (
        <p className="mt-2 text-sm text-ink leading-relaxed line-clamp-3">
          {entry.text}
        </p>
      ) : null}

      <PhotoStrip photos={photos} />
    </Link>
  )
}
