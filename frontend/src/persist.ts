import { useEffect, useState } from 'react'

/**
 * A UI choice remembered across reloads in localStorage. Only the listed values are accepted,
 * so a stale or edited entry falls back to `initial`; storage errors (private mode, quota) are
 * ignored and the choice simply isn't remembered.
 */
export function usePersistentChoice<T extends string>(key: string, initial: T, allowed: readonly T[]): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key)
      return allowed.includes(stored as T) ? (stored as T) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // Not remembered; the choice still applies for this session.
    }
  }, [key, value])

  return [value, setValue]
}
