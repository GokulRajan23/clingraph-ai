import type { PillMode } from '../components/ParticlePill'
import type { InputState } from './useVoiceInput'

/**
 * The one state the voice assistant is in, folded from the microphone, the pending answer and
 * the speech player. The pill, its caption and what tapping it does all follow from this.
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

/**
 * The status caption under the pill, in capitals. `name` is the patient's first name; `followUp`
 * once a question has been answered.
 */
export function phaseStatus(phase: VoicePhase, name: string, followUp: boolean): string {
  switch (phase) {
    case 'waiting':
      return 'NO REPORTS CONNECTED'
    case 'idle':
      return followUp ? 'TAP TO ASK A FOLLOW-UP' : `TAP TO ASK ABOUT ${name.toUpperCase()}'S HISTORY`
    case 'listening':
      return 'LISTENING · PAUSE WHEN DONE'
    case 'transcribing':
      return 'TRANSCRIBING'
    case 'thinking':
      return 'READING THE REPORTS'
    case 'preparing':
      return 'PREPARING VOICE'
    case 'speaking':
      return 'SPEAKING · TAP TO STOP'
  }
}

/** How the pill moves in each phase. */
export function pillMode(phase: VoicePhase): PillMode {
  if (phase === 'listening') return 'listening'
  if (phase === 'speaking') return 'speaking'
  if (phase === 'transcribing' || phase === 'thinking' || phase === 'preparing') return 'thinking'
  return 'idle'
}
