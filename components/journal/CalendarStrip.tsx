'use client'

import { useMemo } from 'react'

interface Props {
  year: number
  month: number
  entryDates: Set<string>
  selectedDate: string | null
  onDateSelect: (date: string) => void
  onMonthChange: (year: number, month: number) => void
}

const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function CalendarStrip({
  year, month, entryDates, selectedDate, onDateSelect, onMonthChange,
}: Props) {
  const today = new Date()
  const todayStr = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')

  const { daysInMonth, firstDow } = useMemo(() => ({
    daysInMonth: new Date(year, month, 0).getDate(),
    firstDow: new Date(year, month - 1, 1).getDay(),
  }), [year, month])

  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function prev() {
    if (month === 1) onMonthChange(year - 1, 12)
    else onMonthChange(year, month - 1)
  }

  function next() {
    if (month === 12) onMonthChange(year + 1, 1)
    else onMonthChange(year, month + 1)
  }

  return (
    <div id="calendar-strip" className="bg-surface sticky top-0 z-10 px-3 pt-3 pb-2" style={{ boxShadow: '0 1px 0 #E8E3DC' }}>
      {/* Month header */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={prev}
          className="w-8 h-8 flex items-center justify-center text-forest text-xl rounded-full active:bg-bone"
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-ink">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <button
          onClick={next}
          className="w-8 h-8 flex items-center justify-center text-forest text-xl rounded-full active:bg-bone"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-mushroom">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="h-9" />

          const dateStr = [
            year,
            String(month).padStart(2, '0'),
            String(day).padStart(2, '0'),
          ].join('-')

          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          const hasEntry = entryDates.has(dateStr)

          return (
            <button
              key={i}
              onClick={() => onDateSelect(dateStr)}
              className="flex flex-col items-center pb-1 pt-0.5 gap-px"
            >
              <span
                className={[
                  'w-7 h-7 flex items-center justify-center text-xs rounded-full',
                  isToday
                    ? 'bg-forest text-surface font-bold'
                    : isSelected
                    ? 'bg-bone text-ink font-semibold'
                    : hasEntry
                    ? 'bg-leaf text-surface font-semibold'
                    : 'text-ink',
                ].join(' ')}
              >
                {day}
              </span>
              <span className="w-1.5 h-1" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
