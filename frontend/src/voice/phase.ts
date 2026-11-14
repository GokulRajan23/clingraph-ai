import type { InputState } from './useVoiceInput'

/**
 * The one state the voice assistant is in, folded from the microphone, the pending answer and
 * the speech player. The orb, its status line and its buttons all follow from this.
 */
export type VoicePhase = 'waiting' | 'idle' | 'listening' | 'transcribing' | 'thinking' | 'preparing' | 'speaking'

export interface PhaseInputs {
  /** A graph is loaded, so questions can be answered. */
  ready: boolean
  input: InputState
  /** An answer is being fetched. */
  pending: boolean
  /** Audio for an answer is being synthesised, or is playing. */
  loading: boolean
  playing: boolean
}

export function voicePhase({ ready, input, pending, loading, playing }: PhaseInputs): VoicePhase {
  if (!ready) return 'waiting'
  if (input === 'recording') return 'listening'
  if (input === 'transcribing') return 'transcribing'
  if (pending) return 'thinking'
  if (loading) return 'preparing'
  if (playing) return 'speaking'
  return 'idle'
}

/** Status line under (or beside) the orb. `docked` once a conversation has started. */
export function phaseStatus(phase: VoicePhase, docked: boolean): string {
  switch (phase) {
    case 'waiting':
      return 'Waiting for reports…'
    case 'idle':
      return docked ? 'Tap to ask a follow-up' : "Tap to ask about this patient's history"
    case 'listening':
      return "Listening… pause when you're done"
    case 'transcribing':
      return 'Transcribing…'
    case 'thinking':
      return 'Checking the reports…'
    case 'preparing':
      return 'Preparing audio…'
    case 'speaking':
      return 'Speaking…'
  }
}

/** How fast the orb's fluid moves: calm at rest, stirred while working. */
export const PHASE_SPEED: Record<VoicePhase, number> = {
  waiting: 0.35,
  idle: 1,
  listening: 1.6,
  transcribing: 2.8,
  thinking: 2.8,
  preparing: 2.8,
  speaking: 1.8,
}
