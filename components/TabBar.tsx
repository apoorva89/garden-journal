'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/journal', label: 'Journal', icon: '📖' },
  { href: '/crops', label: 'Crops', icon: '🌱' },
  { href: '/next-season', label: 'Next Season', icon: '🌿' },
]

export default function TabBar() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-surface border-t border-bone flex items-stretch z-20">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + '/')
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${
              active ? 'text-forest' : 'text-mushroom'
            }`}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            <span>{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
