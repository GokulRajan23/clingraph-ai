import type { Assertion, Category, Change, Field, ReviewStatus } from './types'

export const ASSERTION: Record<Assertion, string> = {
  present: 'Present',
  absent: 'Absent (negated)',
  suspected: 'Suspected',
  historical: 'Historical (earlier report)',
  unknown: 'Unknown or pending',
}

export const CHANGE: Record<Change, string> = {
  first_documented: 'First documented in this report',
  progressed: 'Progressed (stated)',
  stable: 'Stable (stated)',
  improved: 'Improved (stated)',
  performed: 'Performed',
  unknown: 'Change unknown',
  unclear: 'Unclear: contradictory statements',
}

export const CATEGORY: Record<Category, string> = {
  finding: 'Finding',
  complication: 'Complication',
  procedure: 'Procedure',
  device: 'Device',
}

export const FLAGS: Record<string, string> = {
  event_date_not_in_evidence: 'Event date is not written in the cited passage. Review before use.',
}

export const RELATION: Record<string, string> = {
  progressed: 'Progressed',
  stable: 'Stable',
  improved: 'Improved',
  compared: 'Compared',
  same_finding: 'Possibly the same finding',
  unclear: 'Unclear: contradictory statements',
  historical_reference: 'Refers back to an earlier report',
}

export const FIELD: Record<Field, string> = {
  concept: 'Concept',
  category: 'Category',
  assertion: 'Assertion',
  change: 'Change status',
  event_date: 'Event date',
}

export const REVIEW: Record<ReviewStatus, { label: string; icon: string }> = {
  unreviewed: { label: 'Unreviewed', icon: '○' },
  confirmed: { label: 'Confirmed', icon: '✓' },
  corrected: { label: 'Corrected', icon: '✎' },
  rejected: { label: 'Rejected', icon: '✕' },
}

export const SIDE: Record<string, string> = { right: 'right', left: 'left', bilateral: 'bilateral' }

/** Display value of an event field ("not stated" for a missing event date). */
export function fieldValue(field: Field, value: unknown): string {
  if (field === 'assertion') return ASSERTION[value as Assertion] ?? String(value)
  if (field === 'change') return CHANGE[value as Change] ?? String(value)
  if (field === 'category') return CATEGORY[value as Category] ?? String(value)
  if (field === 'event_date') return value ? String(value) : 'not stated'
  return String(value)
}

export function formatTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}
