import { describe, expect, it } from 'vitest'
import { phaseStatus, pillMode, voicePhase, type PhaseInputs } from './phase'

const base: PhaseInputs = { ready: true, input: 'idle', pending: false, loading: false, playing: false }

describe('voice phase', () => {
  it('waits for reports before anything else', () => {
    expect(voicePhase({ ...base, ready: false, input: 'recording', pending: true })).toBe('waiting')
  })

  it('follows one question from the mic to the spoken answer', () => {
    expect(voicePhase(base)).toBe('idle')
    expect(voicePhase({ ...base, input: 'recording' })).toBe('listening')
    expect(voicePhase({ ...base, input: 'transcribing' })).toBe('transcribing')
    expect(voicePhase({ ...base, pending: true })).toBe('thinking')
    expect(voicePhase({ ...base, loading: true })).toBe('preparing')
    expect(voicePhase({ ...base, playing: true })).toBe('speaking')
  })

  it('the microphone wins over an answer still being read', () => {
    // Starting to record stops playback, but the two flags can overlap for a render.
    expect(voicePhase({ ...base, input: 'recording', playing: true })).toBe('listening')
  })

  it('invites the first question by name, then follow-ups', () => {
    expect(phaseStatus('idle', 'Martin', false)).toBe("TAP TO ASK ABOUT MARTIN'S HISTORY")
    expect(phaseStatus('idle', 'Martin', true)).toBe('TAP TO ASK A FOLLOW-UP')
  })

  it('says nothing under the pill while it works or speaks', () => {
    expect(phaseStatus('listening', 'Martin', false)).toBe('LISTENING · PAUSE WHEN DONE')
    for (const phase of ['transcribing', 'thinking', 'preparing', 'speaking'] as const) expect(phaseStatus(phase, 'Martin', true)).toBe('')
  })

  it('moves the pill with the phase', () => {
    expect(pillMode('listening')).toBe('listening')
    expect(pillMode('thinking')).toBe('thinking')
    expect(pillMode('preparing')).toBe('thinking')
    expect(pillMode('speaking')).toBe('speaking')
    expect(pillMode('waiting')).toBe('idle')
  })
})
