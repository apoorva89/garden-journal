'use client'

import { useSyncExternalStore } from 'react'

export const SYNC_FRAGMENT = '#sync'

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}

export function useSyncFragment() {
  return useSyncExternalStore(
    subscribe,
    () => window.location.hash === SYNC_FRAGMENT,
    () => false,
  )
}

export function setSyncFragment(open: boolean) {
  const url = new URL(window.location.href)
  url.hash = open ? SYNC_FRAGMENT : ''
  window.history.replaceState(null, '', url)
  // Replacing the URL preserves the scroll position and does not emit hashchange.
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}
