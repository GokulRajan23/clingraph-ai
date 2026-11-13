import { describe, expect, it } from 'vitest'
import { availableActions, describeCorrection, differsFromExtracted, diffChanges, draftError, draftOf, historyFor, revertField } from './corrections'
import { correction, doc, obs } from './fixtures'

const report = doc('R2', '2024-03-12')

describe('available actions', () => {
  it('follows the review status', () => {
    const actions = (status: Parameters<typeof availableActions>[0]) => availableActions(status).map((a) => a.action)
    expect(actions('unreviewed')).toEqual(['confirm', 'reject', 'edit'])
    expect(actions('confirmed')).toEqual(['restore', 'reject', 'edit'])
    expect(actions('corrected')).toEqual(['reject', 'edit'])
    expect(actions('rejected')).toEqual(['restore'])
    expect(availableActions('rejected')[0].label).toBe('Undo rejection')
    expect(availableActions('confirmed')[0].label).toBe('Mark as unreviewed')
  })
})

describe('edit drafts', () => {
  const stent = obs('s', report, { event_date: '2024-03-01' }, { concept: 'Bile duct stent', category: 'device', event_date: '2024-03-01' })

  it('sends only changed fields, with the concept trimmed', () => {
    const draft = draftOf(stent)
    expect(diffChanges(stent, draft)).toBeNull()
    expect(diffChanges(stent, { ...draft, concept: '  Bile duct stent ' })).toBeNull()
    expect(diffChanges(stent, { ...draft, concept: ' Biliary stent ', assertion: 'suspected' })).toEqual({ concept: 'Biliary stent', assertion: 'suspected' })
    expect(diffChanges(stent, { ...draft, event_date: '' })).toEqual({ event_date: null })
  })

  it('reverts a corrected field to the extracted value', () => {
    const corrected = obs('s', report, { concept: 'Biliary stent', review_status: 'corrected', corrected_fields: ['concept'] }, { concept: 'Bile duct stent' })
    const draft = draftOf(corrected)
    expect(differsFromExtracted(corrected, draft, 'concept')).toBe(true)
    const reverted = revertField(corrected, draft, 'concept')
    expect(reverted.concept).toBe('Bile duct stent')
    expect(differsFromExtracted(corrected, reverted, 'concept')).toBe(false)
    expect(diffChanges(corrected, reverted)).toEqual({ concept: 'Bile duct stent' })
    const noDate = obs('n', report, { event_date: '2024-01-01' }, { event_date: null })
    expect(revertField(noDate, draftOf(noDate), 'event_date').event_date).toBe('')
  })

  it('validates the concept and date', () => {
    const draft = draftOf(stent)
    expect(draftError(draft)).toBeNull()
    expect(draftError({ ...draft, concept: '   ' })).toBe('Concept cannot be empty.')
    expect(draftError({ ...draft, concept: 'x'.repeat(201) })).toMatch(/200/)
    expect(draftError({ ...draft, event_date: '10.01.2024' })).toMatch(/date/)
  })
})

describe('history', () => {
  it('lists one observation, newest first, with readable changes', () => {
    const log = [
      correction(1, 'a'),
      correction(2, 'b'),
      correction(3, 'a', { action: 'edit', changes: { concept: 'Biliary stent', event_date: null }, previous: { concept: 'Bile duct stent', event_date: '2024-03-01' }, status_before: 'confirmed', status_after: 'corrected' }),
      correction(4, 'a', { action: 'reject', status_before: 'corrected', status_after: 'rejected' }),
      correction(5, 'a', { action: 'restore', status_before: 'rejected', status_after: 'corrected' }),
    ]
    expect(historyFor('a', log).map((c) => c.seq)).toEqual([5, 4, 3, 1])
    expect(describeCorrection(log[2])).toEqual({
      title: 'Edited',
      changes: ['Concept: “Bile duct stent” → “Biliary stent”', 'Event date: 2024-03-01 → not stated'],
      status: 'Confirmed → Corrected',
    })
    expect(describeCorrection(log[4]).title).toBe('Rejection undone')
    expect(describeCorrection(correction(6, 'a', { action: 'restore', status_before: 'confirmed', status_after: 'unreviewed' })).title).toBe('Marked as unreviewed')
  })
})
