import { useSyncExternalStore } from 'react'
import type { Color } from './openings'

// Progress lives in this browser only. A line counts as completed for the
// colour it was played with, so White and Black are tracked separately.

interface OpeningProgress {
  color?: Color
  white: string[]
  black: string[]
}
type Store = Record<string, OpeningProgress>

const KEY = 'mainline:progress:v1'

function load(): Store {
  try {
    const text = localStorage.getItem(KEY)
    return text ? (JSON.parse(text) as Store) : {}
  } catch {
    return {}
  }
}

let store: Store = load()
const listeners = new Set<() => void>()

function commit(next: Store) {
  store = next
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // Private mode or a full disk: keep going with in-memory progress.
  }
  listeners.forEach((l) => l())
}

const entry = (slug: string): OpeningProgress => store[slug] ?? { white: [], black: [] }

export function markDone(slug: string, color: Color, lineId: string) {
  const e = entry(slug)
  if (e[color].includes(lineId)) return
  commit({ ...store, [slug]: { ...e, [color]: [...e[color], lineId] } })
}

export function setColor(slug: string, color: Color) {
  commit({ ...store, [slug]: { ...entry(slug), color } })
}

export function resetOpening(slug: string, color: Color) {
  commit({ ...store, [slug]: { ...entry(slug), [color]: [] } })
}

export function useProgress(): Store {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => store,
  )
}

export const chosenColor = (s: Store, slug: string, fallback: Color): Color =>
  s[slug]?.color ?? fallback

const EMPTY: string[] = []
export const doneLines = (s: Store, slug: string, color: Color): string[] =>
  s[slug]?.[color] ?? EMPTY
