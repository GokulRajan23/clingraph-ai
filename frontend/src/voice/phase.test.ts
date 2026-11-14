import { describe, expect, it } from 'vitest'
import { phaseStatus, voicePhase, type PhaseInputs } from './phase'

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

  it('invites a follow-up once the conversation has started', () => {
    expect(phaseStatus('idle', false)).toMatch(/patient's history/)
    expect(phaseStatus('idle', true)).toBe('Tap to ask a follow-up')
  })
})
